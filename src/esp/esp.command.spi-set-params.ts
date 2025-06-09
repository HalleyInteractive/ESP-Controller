import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "./esp.command";

export class EspCommandSetSpiParams extends EspCommandPacket {
  private paramsData = new ArrayBuffer(24);
  private id = new DataView(this.paramsData, 0, 4);
  private totalSize = new DataView(this.paramsData, 4, 4);
  private blockSize = new DataView(this.paramsData, 8, 4);
  private sectorSize = new DataView(this.paramsData, 12, 4);
  private pageSize = new DataView(this.paramsData, 16, 4);
  private statusMask = new DataView(this.paramsData, 20, 4);

  constructor() {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.SPI_SET_PARAMS;
    this.id.setUint32(0, 0, true);
    this.totalSize.setUint32(0, 4 * 1024 * 1024, true);
    this.blockSize.setUint32(0, 0x10000, true);
    this.sectorSize.setUint32(0, 0x1000, true);
    this.pageSize.setUint32(0, 0x100, true);
    this.statusMask.setUint32(0, 0xffff, true);
    this.data = new Uint8Array(this.paramsData);
  }
}
