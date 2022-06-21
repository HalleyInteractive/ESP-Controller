import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from '../ESP32CommandPacket';

export class ReadRegCommand extends ESP32DataPacket {
  private readRegData = new ArrayBuffer(4);

  constructor(address: number) {
    super();

    this.command = ESP32Command.READ_REG;
    this.direction = ESP32DataPacketDirection.REQUEST;
    console.log(`Read reg from address ${address}`);
    new DataView(this.readRegData).setUint32(0, address, true);
    this.data = new Uint8Array(this.readRegData);
  }
}
