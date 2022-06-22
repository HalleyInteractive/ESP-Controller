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
    const blockSizeView = new DataView(flashDownloadData.buffer, 0, 4);
    const sequenceView = new DataView(flashDownloadData.buffer, 4, 4);
    const paddingView = new DataView(flashDownloadData.buffer, 8, 8);

    blockSizeView.setUint32(0, blockSize, true);
    sequenceView.setUint32(0, sequenceNumber, true);

    paddingView.setUint32(0, 0, true);
    paddingView.setUint32(4, 0, true);

    const block = image.slice(
      sequenceNumber * blockSize,
      sequenceNumber * blockSize + blockSize
    );

    const blockData = new Uint8Array(blockSize);
    blockData.fill(0xff);
    blockData.set(block, 0);

    // console.log(`BLOCK ${sequenceNumber}`, block);

    flashDownloadData.set(blockData, 16);
    this.data = flashDownloadData;
    this.checksum = this.generateChecksum(blockData);
  }
}
