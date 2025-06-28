import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandFlashEnd extends EspCommandPacket {
  constructor(public runUserCode = false) {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.FLASH_END;
    this.checksum = 0; // Not used

    const dataPayload = new Uint8Array(4);
    const view = new DataView(dataPayload.buffer);
    // 0 to reboot, 1 to run user code
    view.setUint32(0, runUserCode ? 1 : 0, true);
    this.data = dataPayload;
  }
}
