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
      try {
        const syncCommand = new ESP32DataPacket();
        syncCommand.command = ESP32Command.SYNC;
        syncCommand.direction = ESP32DataPacketDirection.REQUEST;
        syncCommand.data = new Uint8Array([
          0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
          0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
          0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
          0x55, 0x55, 0x55,
        ]);
        syncCommand.checksum = 0;
        await this.controller?.write(syncCommand.getPacketData());

        const response = await this.controller?.response(100);
        console.log('RESPONSE', response);
        break;
      } catch {
        console.log(`Sync attempt ${i + 1} of ${maxAttempts}`);
        await sleep(800);
        continue;
      }
    }
  }

  async reset() {
    this.controller?.resetPulse();
  }

  get portConnected() {
    return this.controller?.connected;
  }
}
