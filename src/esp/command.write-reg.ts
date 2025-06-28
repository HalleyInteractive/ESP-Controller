import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandWriteReg extends EspCommandPacket {
  constructor(
    public address: number,
    public writeValue: number, // Renamed from 'value' to avoid conflict
    public mask = 0xffffffff,
    public delayUs = 0,
  ) {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.WRITE_REG;
    this.checksum = 0; // Not used for this command

    const dataPayload = new Uint8Array(16);
    const view = new DataView(dataPayload.buffer);
    view.setUint32(0, this.address, true);
    view.setUint32(4, this.writeValue, true); // Use the corrected property name
    view.setUint32(8, this.mask, true);
    view.setUint32(12, this.delayUs, true);

    this.data = dataPayload;
  }
}
