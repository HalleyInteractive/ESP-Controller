import {BinFilePartion} from './partition';
import {FlashDataCommand} from './serial/command/FlashData';
import {SPIFlashBeginCommand} from './serial/command/SPIFlashBegin';
import {SPISetParamsCommand} from './serial/command/SPISetParams';
import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from './serial/ESP32CommandPacket';
import {PortController} from './serial/port-controller';
import {sleep} from './serial/utils/common';

export class ESP32Controller {
  private controller: PortController | undefined;
  private port: SerialPort | undefined;
  private synced = false;
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
        const response = await this.readResponse(ESP32Command.SYNC);
        console.log('RESPONSE', response);
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
    const readRegCommand = new ESP32DataPacket();
    readRegCommand.command = ESP32Command.READ_REG;
    readRegCommand.direction = ESP32DataPacketDirection.REQUEST;
    const address = new ArrayBuffer(4);
    new DataView(address).setUint32(0, 0x60000078, true);
    readRegCommand.data = new Uint8Array(address);
    await this.controller?.write(readRegCommand.getPacketData());
    const response = await this.readResponse(ESP32Command.READ_REG);

    if (response?.command === ESP32Command.READ_REG) {
      switch (response.value) {
        case 0x15122500:
          console.log('CHIP FAMILY: ESP32');
          break;
        case 0x500:
          console.log('CHIP FAMILY: ESP32S2');
          break;
        case 0x00062000:
          console.log('CHIP FAMILY: ESP8266');
          break;
      }
    }
    console.group('RESPONSE');
    console.log('RESPONSE', response);
    console.log('DIRECTION', response?.direction);
    console.log('COMMAND', response?.command);
    console.log('SIZE', response?.size);
    console.log('VALUE', response?.value);
    console.log('DATA', response?.data);
    console.groupEnd();
  }

  async flashImage() {
    if (this.synced && this.controller) {
      const attachCommand = new ESP32DataPacket();
      attachCommand.command = ESP32Command.SPI_ATTACH;
      attachCommand.direction = ESP32DataPacketDirection.REQUEST;
      await this.controller.write(attachCommand.getPacketData());

      const apiParamCMD = new SPISetParamsCommand();
      await this.controller.write(apiParamCMD.getPacketData());

      const app = new BinFilePartion(0x10000, './bin/simple_arduino.ino.bin');
      await app.load();

      const flashBeginCMD = new SPIFlashBeginCommand(app.binary, app.offset);
      await this.controller.write(flashBeginCMD.getPacketData());

      const packetSize = 64 * 1024;
      const numPackets = Math.ceil(app.binary.length / packetSize);

      for (let i = 0; i < numPackets; i++) {
        const flashCommand = new FlashDataCommand(app.binary, i, packetSize);
        await this.controller.write(flashCommand.getPacketData());
        console.log(`Flashed packet ${i+1} of ${numPackets}`);
      }
    }
  }

  async readResponse(cmd: ESP32Command): Promise<ESP32DataPacket> {
    const responsePacket = new ESP32DataPacket();
    // let reframed = false;
    if (this.controller) {
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        // if (i > maxAttempts / 2 && !reframed) {
        //   this.reframe();
        //   reframed = true;
        // }
        const response = await this.controller?.response(300);
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
