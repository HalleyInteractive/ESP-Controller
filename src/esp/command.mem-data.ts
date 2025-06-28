import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandMemData extends EspCommandPacket {
  constructor(
    public binary: Uint8Array,
    public sequence: number,
    public packetSize: number,
  ) {
    super();

    const chunk = binary.slice(
      sequence * packetSize,
      (sequence + 1) * packetSize,
    );

    const header = new Uint8Array(16);
    const view = new DataView(header.buffer);
    view.setUint32(0, chunk.length, true); // Data size
    view.setUint32(4, sequence, true); // Sequence number
    view.setUint32(8, 0, true); // Zero
    view.setUint32(12, 0, true); // Zero

    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.MEM_DATA;
    this.data = new Uint8Array([...header, ...chunk]);
    this.checksum = this.generateChecksum(chunk);
  }
}
