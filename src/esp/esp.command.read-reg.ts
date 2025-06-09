import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "./esp.command";

export class EspCommandReadReg extends EspCommandPacket {
  private readRegData = new ArrayBuffer(4);

  constructor(address: number) {
    super();

    this.command = EspCommand.READ_REG;
    this.direction = EspPacketDirection.REQUEST;
    console.log(`Read reg from address ${address}`);
    new DataView(this.readRegData).setUint32(0, address, true);
    this.data = new Uint8Array(this.readRegData);
  }
}
