import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "./esp.command";

export class EspCommandSpiAttach extends EspCommandPacket {
  private spiAttachData = new ArrayBuffer(8);
  private view1 = new DataView(this.spiAttachData, 0, 4);
  private view2 = new DataView(this.spiAttachData, 4, 4);

  constructor() {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.SPI_ATTACH;

    this.view1.setUint32(0, 0, true);
    this.view2.setUint32(0, 0, true);
    this.data = new Uint8Array(this.spiAttachData);
  }
}
