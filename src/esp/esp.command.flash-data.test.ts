import { describe, it, expect, beforeEach } from "vitest";
import { EspCommandFlashData } from "./esp.command.flash-data";
import { EspCommand, EspPacketDirection } from "./esp.command";

describe("EspCommandFlashData", () => {
  const blockSize = 4096;
  const sequenceNumber = 5;
  const fullImage = new Uint8Array(blockSize * 10).fill(0xaa); // Mock image data

  let flashDataCommand: EspCommandFlashData;

  beforeEach(() => {
    // Create a new command instance for each test
    flashDataCommand = new EspCommandFlashData(
      fullImage,
      sequenceNumber,
      blockSize,
    );
  });

  it("should set the correct command identifier and packet direction", () => {
    // FLASH_DATA command is identified by 0x03
    expect(flashDataCommand.command).toBe(EspCommand.FLASH_DATA);
    // All host-initiated commands are requests (0x00)
    expect(flashDataCommand.direction).toBe(EspPacketDirection.REQUEST);
  });

  it("should correctly set the data payload size in the packet header", () => {
    // The total data payload for FLASH_DATA is 16 header bytes + block size
    expect(flashDataCommand.size).toBe(16 + blockSize);
  });

  it("should correctly encode the 16-byte data header with little-endian byte order", () => {
    const dataPayload = flashDataCommand.data;
    const dataView = new DataView(dataPayload.buffer);

    // 1. Block size (data size) is the first 32-bit word
    expect(dataView.getUint32(0, true)).toBe(blockSize);
    // 2. Sequence number is the second 32-bit word
    expect(dataView.getUint32(4, true)).toBe(sequenceNumber);
    // 3. The next two 32-bit words should be zero
    expect(dataView.getUint32(8, true)).toBe(0);
    expect(dataView.getUint32(12, true)).toBe(0);
  });

  it("should correctly slice and place the image data in the payload", () => {
    const dataPayload = flashDataCommand.data;
    const blockData = dataPayload.slice(16); // Data starts after the 16-byte header

    // The length of the data block should match the block size
    expect(blockData.length).toBe(blockSize);

    // Verify the content of the sliced block
    const expectedSlice = fullImage.slice(
      sequenceNumber * blockSize,
      (sequenceNumber + 1) * blockSize,
    );
    expect(blockData).toEqual(expectedSlice);
  });

  it("should correctly handle padding for the last block", () => {
    const partialBlockSize = 100;
    const lastSequenceNumber = 9;
    const lastBlockCommand = new EspCommandFlashData(
      fullImage,
      lastSequenceNumber,
      partialBlockSize, // This is now the block size for this command
    );

    const dataPayload = lastBlockCommand.data;
    const blockData = dataPayload.slice(16);

    // The data block should still have the full block size due to padding
    expect(blockData.length).toBe(partialBlockSize);

    // The first part of the block should be the image data
    const partialImageData = fullImage.slice(
      lastSequenceNumber * partialBlockSize,
      lastSequenceNumber * partialBlockSize + partialBlockSize,
    );
    // We must manually pad the expected data to compare
    const expectedPaddedData = new Uint8Array(partialBlockSize).fill(0xff);
    expectedPaddedData.set(partialImageData);

    expect(blockData).toEqual(expectedPaddedData);
  });

  it("should correctly generate the checksum on the data portion only", () => {
    const dataPayload = flashDataCommand.data;
    const blockData = dataPayload.slice(16);

    // Manually calculate the checksum
    let expectedChecksum = 0xef;
    for (const byte of blockData) {
      expectedChecksum ^= byte;
    }

    // Compare with the checksum stored in the packet
    expect(flashDataCommand.checksum).toBe(expectedChecksum);
  });

  it("should assemble the complete packet with the correct main header and full payload", () => {
    const fullPacket = flashDataCommand.getPacketData();
    const dataPayload = flashDataCommand.data;

    // Manually create the expected packet for verification
    const expectedPacket = new Uint8Array(8 + 16 + blockSize);
    const view = new DataView(expectedPacket.buffer);

    // Main 8-byte header
    view.setUint8(0, EspPacketDirection.REQUEST);
    view.setUint8(1, EspCommand.FLASH_DATA);
    view.setUint16(2, 16 + blockSize, true); // Size of the full payload
    view.setUint32(4, flashDataCommand.checksum, true); // Checksum

    // Set the full payload (16-byte header + data)
    expectedPacket.set(dataPayload, 8);

    expect(fullPacket).toEqual(expectedPacket);
  });
});
