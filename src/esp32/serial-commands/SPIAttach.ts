import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from './ESP32CommandPacket';

export class SPIAttachCommand extends ESP32DataPacket {
  private spiAttachData = new ArrayBuffer(8);
  private view1 = new DataView(this.spiAttachData, 0, 4);
  private view2 = new DataView(this.spiAttachData, 4, 4);

  constructor() {
    super();
    this.direction = ESP32DataPacketDirection.REQUEST;
    this.command = ESP32Command.SPI_ATTACH;

    this.view1.setUint32(0, 0, true);
    this.view2.setUint32(0, 0, true);
    this.data = new Uint8Array(this.spiAttachData);
  }
}
