import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandSpiFlashMD5 extends EspCommandPacket {
  constructor(
    public address: number,
    public regionSize: number, // Renamed from 'size' to avoid conflict
  ) {
    super();
    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.SPI_FLASH_MD5;
    this.checksum = 0; // Not used for this command

    const dataPayload = new Uint8Array(16);
    const view = new DataView(dataPayload.buffer);
    view.setUint32(0, this.address, true);
    view.setUint32(4, this.regionSize, true); // Use the corrected property name
    view.setUint32(8, 0, true); // Reserved
    view.setUint32(12, 0, true); // Reserved

    this.data = dataPayload;
  }
}
