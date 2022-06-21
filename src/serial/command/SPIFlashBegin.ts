import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from '../ESP32CommandPacket';

export class SPIFlashBeginCommand extends ESP32DataPacket {
  private flashBeginData = new ArrayBuffer(16);
  private eraseSizeView = new DataView(this.flashBeginData, 0, 4);
  private numDataPacketsView = new DataView(this.flashBeginData, 4, 4);
  private dataSizeView = new DataView(this.flashBeginData, 8, 4);
  private offsetView = new DataView(this.flashBeginData, 12, 4);

  constructor(image: Uint8Array, offset: number) {
    super();

    const packetSize = 64 * 1024;
    const numPackets = Math.ceil(image.length / packetSize);

    this.direction = ESP32DataPacketDirection.REQUEST;
    this.command = ESP32Command.FLASH_BEGIN;
    this.eraseSizeView.setUint32(0, image.length);
    this.numDataPacketsView.setUint32(0, numPackets);
    this.dataSizeView.setUint32(0, packetSize);
    this.offsetView.setUint32(0, offset);
    this.data = new Uint8Array(this.flashBeginData);
  }
}
