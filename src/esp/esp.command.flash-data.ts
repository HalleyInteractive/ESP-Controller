import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "./esp.command";

export class EspCommandFlashData extends EspCommandPacket {
  constructor(image: Uint8Array, sequenceNumber: number, blockSize: number) {
    super();

    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.FLASH_DATA;

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
      sequenceNumber * blockSize + blockSize,
    );

    const blockData = new Uint8Array(blockSize);
    blockData.fill(0xff);
    blockData.set(block, 0);

    flashDownloadData.set(blockData, 16);
    this.data = flashDownloadData;
    this.checksum = this.generateChecksum(blockData);
  }
}
