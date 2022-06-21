import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from '../ESP32CommandPacket';

export class SPISetParamsCommand extends ESP32DataPacket {
  private paramsData = new ArrayBuffer(24);
  private id = new DataView(this.paramsData, 0, 4);
  private totalSize = new DataView(this.paramsData, 4, 4);
  private blockSize = new DataView(this.paramsData, 8, 4);
  private sectorSize = new DataView(this.paramsData, 12, 4);
  private pageSize = new DataView(this.paramsData, 16, 4);
  private statusMask = new DataView(this.paramsData, 20, 4);

  constructor() {
    super();
    this.direction = ESP32DataPacketDirection.REQUEST;
    this.command = ESP32Command.SPI_SET_PARAMS;
    this.id.setUint32(0, 0);
    this.totalSize.setUint32(0, 4 * 1024 * 1024);
    this.blockSize.setUint32(0, 0x10000);
    this.sectorSize.setUint32(0, 0x1000);
    this.pageSize.setUint32(0, 0x100);
    this.statusMask.setUint32(0, 0xffff);
    this.data = new Uint8Array(this.paramsData);
  }
}
