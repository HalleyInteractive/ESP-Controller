import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandChangeBaudrate extends EspCommandPacket {
  constructor(
    public newBaudrate: number,
    public oldBaudrate: number, // 0 for ROM loader, current baudrate for stub
  ) {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.CHANGE_BAUDRATE;
    this.checksum = 0; // Not used

    const dataPayload = new Uint8Array(8);
    const view = new DataView(dataPayload.buffer);
    view.setUint32(0, this.newBaudrate, true);
    view.setUint32(4, this.oldBaudrate, true);
    this.data = dataPayload;
  }
}
