import {FlashDataCommand} from './serial-commands/FlashData';
import {SPIAttachCommand} from './serial-commands/SPIAttach';
import {FlashBeginCommand} from './serial-commands/FlashBegin';
import {SPISetParamsCommand} from './serial-commands/SPISetParams';
import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from './serial-commands/ESP32CommandPacket';
import {PortController} from '../serial/port-controller';
import {sleep} from '../utils/common';
import {ReadRegCommand} from './serial-commands/ReadReg';
import {ESPImage} from './esp32-image';

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
      this.synced = false;
      this.controller = new PortController(this.port);
      this.controller.connect();
    }
  }

  async stop() {
    try {
      await this.controller?.disconnect();
    } catch (e) {
      console.log('Diconnect error');
      console.log(e);
    }
    if (!this.controller?.connected) {
      this.port = undefined;
    }
    this.synced = false;
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

  async flashImage(image: ESPImage) {
    if (this.controller) {
      if (!this.synced) {
        await this.sync();
        if (!this.synced) {
          throw new Error(
            'ESP32 Needs to Sync before flashing a new image. Hold down the `boot` button on the ESP32 during sync attempts.'
          );
        }
      }
      console.log('Loading binary files');
      await image.load();

      const attachCommand = new SPIAttachCommand();
      await this.controller.write(attachCommand.getPacketData());
      await this.readResponse(ESP32Command.SPI_ATTACH);
      console.log('SPI ATTACH SENT');

      const apiParamCMD = new SPISetParamsCommand();
      await this.controller.write(apiParamCMD.getPacketData());
      await this.readResponse(ESP32Command.SPI_SET_PARAMS);
      console.log('SPI PARAMS SET');

      for (const partition of image.partitions) {
        await this.flashBinary(partition);
      }

      console.log('Flashing image done, resetting device...');
      await this.reset();
    }
  }

  async flashBinary(partition: Partition) {
    console.log(
      `Flashing partition: ${partition.filename}, offset: ${partition.offset}`
    );
    const packetSize = 512;
    const numPackets = Math.ceil(partition.binary.length / packetSize);

    const flashBeginCMD = new FlashBeginCommand(
      partition.binary,
      partition.offset,
      packetSize,
      numPackets
    );
    await this.controller?.write(flashBeginCMD.getPacketData());
    await this.readResponse(
      ESP32Command.FLASH_BEGIN,
      (30000 * numPackets * packetSize) / 1000000 + 500
    );
    console.log('FLASH BEGIN SENT');

    for (let i = 0; i < numPackets; i++) {
      const flashCommand = new FlashDataCommand(
        partition.binary,
        i,
        packetSize
      );
      await this.controller?.write(flashCommand.getPacketData());
      console.log(
        `[${partition.filename}] Writing block ${i + 1}/${numPackets}`
      );
      await this.readResponse(
        ESP32Command.FLASH_DATA,
        (30000 * numPackets * packetSize) / 1000000 + 500
      );
    }
  }

  async readResponse(
    cmd: ESP32Command,
    timeout = 2000
  ): Promise<ESP32DataPacket> {
    const responsePacket = new ESP32DataPacket();
    if (this.controller) {
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
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

  async reset() {
    this.synced = false;
    this.controller?.resetPulse();
  }

  get portConnected() {
    return this.controller?.connected;
  }
}
