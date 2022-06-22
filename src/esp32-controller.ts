import {BinFilePartion} from './partition';
import {FlashDataCommand} from './serial/command/FlashData';
import {SPIAttachCommand} from './serial/command/SPIAttach';
import {FlashBeginCommand} from './serial/command/FlashBegin';
import {SPISetParamsCommand} from './serial/command/SPISetParams';
import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from './serial/ESP32CommandPacket';
import {PortController} from './serial/port-controller';
import {sleep} from './serial/utils/common';
import {ReadRegCommand} from './serial/command/ReadReg';

enum ChipFamily {
  UNKNOWN = 0,
  ESP8266 = 1,
  ESP32 = 2,
  ESP32S2 = 3,
}
export class ESP32Controller {
  private controller: PortController | undefined;
  private port: SerialPort | undefined;
  private synced = false;
  private chipFamily: ChipFamily = 0;
  constructor() {}

  async init() {
    this.port = await navigator.serial.requestPort();
    if (this.port) {
      this.controller = new PortController(this.port);
      this.controller.connect();
    }
  }

  async stop() {
    await this.controller?.disconnect();
    if (!this.controller?.connected) {
      this.port = undefined;
    }
  }

  async sync() {
    await this.reset();
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      const syncCommand = new ESP32DataPacket();
      syncCommand.command = ESP32Command.SYNC;
      syncCommand.direction = ESP32DataPacketDirection.REQUEST;
      syncCommand.data = new Uint8Array([
        0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
        0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
        0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
      ]);
      syncCommand.checksum = 0;
      await this.controller?.write(syncCommand.getPacketData());
      try {
        const response = await this.readResponse(ESP32Command.SYNC, 100);
        console.log('SYNCED', response);
        this.synced = true;
        break;
      } catch (error) {
        console.log(`Sync attempt ${i + 1} of ${maxAttempts}`);
        await sleep(500);
        continue;
      }
    }
    if (this.synced) {
      this.readChipFamily();
    }
  }

  async readChipFamily() {
    const readRegCommand = new ReadRegCommand(0x60000078);
    await this.controller?.write(readRegCommand.getPacketData());
    const response = await this.readResponse(ESP32Command.READ_REG);

    if (response?.command === ESP32Command.READ_REG) {
      switch (response.value) {
        case 0x15122500:
          this.chipFamily = ChipFamily.ESP32;
          console.log('CHIP FAMILY: ESP32');
          break;
        case 0x500:
          this.chipFamily = ChipFamily.ESP32S2;
          console.log('CHIP FAMILY: ESP32S2');
          break;
        case 0x00062000:
          this.chipFamily = ChipFamily.ESP8266;
          console.log('CHIP FAMILY: ESP8266');
          break;
        default:
          this.chipFamily = ChipFamily.UNKNOWN;
          break;
      }
    }

    const baseAddress = [0, 0x3ff00050, 0x6001a000, 0x6001a000][
      this.chipFamily
    ];
    for (let i = 0; i < 4; i++) {
      const readRegCommand = new ReadRegCommand(baseAddress + 4 * i);
      await this.controller?.write(readRegCommand.getPacketData());
      const response = await this.readResponse(ESP32Command.READ_REG);
      console.log(`eFuse ${i}`, response);
    }
  }

  async flashImage() {
    if (this.synced && this.controller) {
      const attachCommand = new SPIAttachCommand();
      await this.controller.write(attachCommand.getPacketData());
      await this.readResponse(ESP32Command.SPI_ATTACH);
      console.log('SPI ATTACH SENT');

      const apiParamCMD = new SPISetParamsCommand();
      await this.controller.write(apiParamCMD.getPacketData());
      await this.readResponse(ESP32Command.SPI_SET_PARAMS);
      console.log('SPI PARAMS SET');

      const app = new BinFilePartion(0x10000, './bin/simple_arduino.ino.bin');
      await app.load();

      const packetSize = 512;
      const numPackets = Math.ceil(app.binary.length / packetSize);

      const flashBeginCMD = new FlashBeginCommand(
        app.binary,
        app.offset,
        packetSize,
        numPackets
      );
      await this.controller.write(flashBeginCMD.getPacketData());
      await this.readResponse(
        ESP32Command.FLASH_BEGIN,
        (30000 * numPackets * packetSize) / 1000000 + 500
      );
      console.log('FLASH BEGIN SENT');

      for (let i = 0; i < numPackets; i++) {
        const flashCommand = new FlashDataCommand(app.binary, i, packetSize);
        await this.controller.write(flashCommand.getPacketData());
        console.log(
          `block ${i + 1}/${numPackets}, giving response timeout: ${
            (30000 * numPackets * packetSize) / 1000000 + 500
          }`
        );
        await this.readResponse(
          ESP32Command.FLASH_DATA,
          (30000 * numPackets * packetSize) / 1000000 + 500
        );
      }
    }
  }

  async readResponse(
    cmd: ESP32Command,
    timeout = 2000
  ): Promise<ESP32DataPacket> {
    const responsePacket = new ESP32DataPacket();
    // let reframed = false;
    if (this.controller) {
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        // if (i > maxAttempts / 2 && !reframed) {
        //   this.reframe();
        //   reframed = true;
        // }
        const response = await this.controller?.response(timeout);
        try {
          responsePacket.parseResponse(response);
        } catch (error) {
          console.log('Incorrect packet response', error);
          continue;
        }

        if (responsePacket.direction !== ESP32DataPacketDirection.RESPONSE) {
          console.log('Incorrect packet direction');
          continue;
        }

        if (responsePacket.command !== cmd) {
          console.log('Incorrect response command');
          continue;
        }
        return responsePacket;
      }
    }
    return responsePacket;
  }

  log() {
    // console.groupCollapsed('All Requests');
    // console.table(this.controller?.allRequests);
    // console.groupEnd();

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      this.controller?.allSerial
        .map((e: Uint8Array) => e?.join(','))
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    window.open(encodedUri);

    // console.groupCollapsed('All Responses');
    // console.table(this.controller?.allResponses);
    // console.groupEnd();
  }

  reframe() {
    this.controller?.reframe();
  }

  async reset() {
    this.controller?.resetPulse();
  }

  get portConnected() {
    return this.controller?.connected;
  }
}
