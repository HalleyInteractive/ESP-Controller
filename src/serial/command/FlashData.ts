import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from '../ESP32CommandPacket';

export class FlashDataCommand extends ESP32DataPacket {
  constructor(image: Uint8Array, sequenceNumber: number, blockSize: number) {
    super();

    this.direction = ESP32DataPacketDirection.REQUEST;
    this.command = ESP32Command.FLASH_DATA;

    const flashDownloadData = new Uint8Array(16 + blockSize);
    flashDownloadData.fill(0xff);

    const blockSizeView = new DataView(flashDownloadData.buffer, 0, 4);
    const sequenceView = new DataView(flashDownloadData.buffer, 4, 4);

    blockSizeView.setUint32(0, blockSize, true);
    sequenceView.setUint32(0, sequenceNumber, true);

    flashDownloadData.fill(0x00, 8, 16);

    const block = image.slice(
      sequenceNumber * blockSize,
      sequenceNumber * blockSize + blockSize
    );

    flashDownloadData.set(block, 16);
    this.data = flashDownloadData;
    this.checksum = this.generateChecksum(block);
  }
}
