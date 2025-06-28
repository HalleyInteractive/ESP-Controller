import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandMemBegin extends EspCommandPacket {
  constructor(
    public totalSize: number,
    public numPackets: number,
    public packetSize: number,
    public offset: number,
  ) {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.MEM_BEGIN;
    this.checksum = 0; // Not used for this command

    const dataPayload = new Uint8Array(16);
    const view = new DataView(dataPayload.buffer);
    view.setUint32(0, this.totalSize, true);
    view.setUint32(4, this.numPackets, true);
    view.setUint32(8, this.packetSize, true);
    view.setUint32(12, this.offset, true);

    this.data = dataPayload;
  }
}
