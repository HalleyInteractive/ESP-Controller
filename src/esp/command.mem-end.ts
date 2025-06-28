import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandMemEnd extends EspCommandPacket {
  constructor(
    public executeFlag: number,
    public entryPoint: number,
  ) {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.MEM_END;
    this.checksum = 0; // Not used

    const dataPayload = new Uint8Array(8);
    const view = new DataView(dataPayload.buffer);
    view.setUint32(0, this.executeFlag, true);
    view.setUint32(4, this.entryPoint, true);

    this.data = dataPayload;
  }
}
