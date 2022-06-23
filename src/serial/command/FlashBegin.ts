import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from '../../ESP32CommandPacket';

export class FlashBeginCommand extends ESP32DataPacket {
  private flashBeginData = new ArrayBuffer(16);
  private eraseSizeView = new DataView(this.flashBeginData, 0, 4);
  private numDataPacketsView = new DataView(this.flashBeginData, 4, 4);
  private dataSizeView = new DataView(this.flashBeginData, 8, 4);
  private offsetView = new DataView(this.flashBeginData, 12, 4);

  constructor(
    image: Uint8Array,
    offset: number,
    packetSize: number,
    numPackets: number
  ) {
    super();

    this.direction = ESP32DataPacketDirection.REQUEST;
    this.command = ESP32Command.FLASH_BEGIN;
    this.eraseSizeView.setUint32(0, image.length, true);
    this.numDataPacketsView.setUint32(0, numPackets, true);
    this.dataSizeView.setUint32(0, packetSize, true);
    this.offsetView.setUint32(0, offset, true);
    this.data = new Uint8Array(this.flashBeginData);
  }
}
