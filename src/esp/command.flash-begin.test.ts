/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach } from "vitest";
// Adjust these paths to match your project structure
import { EspCommandFlashBegin } from "./command.flash-begin";
import { EspCommand, EspPacketDirection } from "./command";

describe("EspCommandFlashBegin", () => {
  // Define mock input values for consistent testing
  const mockImageLength = 1024; // Represents an image size of 1024 bytes
  const mockImage = new Uint8Array(mockImageLength);
  const mockOffset = 0x1000;
  const mockPacketSize = 256;
  const mockNumPackets = 4;

  let flashBeginCommand: EspCommandFlashBegin;

  // Before each test, create a fresh instance of the command
  beforeEach(() => {
    flashBeginCommand = new EspCommandFlashBegin(
      mockImage,
      mockOffset,
      mockPacketSize,
      mockNumPackets,
    );
  });

  it("should set the correct command identifier and packet direction", () => {
    // The FLASH_BEGIN command is identified by 0x02.
    // All host-initiated commands are requests, identified by 0x00.
    expect(flashBeginCommand.command).toBe(EspCommand.FLASH_BEGIN);
    expect(flashBeginCommand.direction).toBe(EspPacketDirection.REQUEST);
  });

  it("should correctly set the data payload length in the packet header", () => {
    // The FLASH_BEGIN command requires four 32-bit words as input data.
    // Four 32-bit words (4 bytes each) totals 16 bytes for the data payload.
    // The `size` field in the packet header should reflect this data length.
    expect(flashBeginCommand.size).toBe(16);
  });

  it("should correctly encode the four 32-bit data payload values with little-endian byte order", () => {
    // The data payload of the FLASH_BEGIN command consists of four 32-bit words:
    // 1. Size to erase (image.length)
    // 2. Number of data packets (numPackets)
    // 3. Data size in one packet (packetSize)
    // 4. Flash offset (offset)
    // All multi-byte fields in the serial protocol are little-endian.

    // Retrieve the full packet, then extract the data payload (which starts after the 8-byte header).
    const fullPacket = flashBeginCommand.getPacketData();
    const dataView = new DataView(fullPacket.buffer, fullPacket.byteOffset + 8); // Data starts at offset 8

    // Verify each 32-bit word using getUint32 with true for little-endian
    // eraseSize (image.length) is the first 32-bit word (offset 0 in data payload)
    expect(dataView.getUint32(0, true)).toBe(mockImageLength);
    // numDataPackets is the second 32-bit word (offset 4 in data payload)
    expect(dataView.getUint32(4, true)).toBe(mockNumPackets);
    // dataSizeInPacket is the third 32-bit word (offset 8 in data payload)
    expect(dataView.getUint32(8, true)).toBe(mockPacketSize);
    // flashOffset is the fourth 32-bit word (offset 12 in data payload)
    expect(dataView.getUint32(12, true)).toBe(mockOffset);
  });

  it("should generate the complete packet with the correct header and data bytes", () => {
    const fullPacket = flashBeginCommand.getPacketData();

    // Construct the expected 8-byte header:
    // Byte 0: Direction (0x00 for REQUEST)
    // Byte 1: Command (0x02 for FLASH_BEGIN)
    // Bytes 2-3: Size (16 bytes, little-endian: 0x10 0x00)
    // Bytes 4-7: Checksum/Value (ignored for FLASH_BEGIN, so typically 0x00000000)
    const expectedHeader = new Uint8Array([
      EspPacketDirection.REQUEST, // 0x00
      EspCommand.FLASH_BEGIN, // 0x02
      0x10,
      0x00, // Size: 16 (little-endian)
      0x00,
      0x00,
      0x00,
      0x00, // Checksum (ignored)
    ]);

    // Construct the expected 16-byte data payload:
    // Use a DataView to write little-endian 32-bit values into an ArrayBuffer
    const expectedDataBuffer = new ArrayBuffer(16);
    const expectedDataView = new DataView(expectedDataBuffer);
    expectedDataView.setUint32(0, mockImageLength, true); // 1024
    expectedDataView.setUint32(4, mockNumPackets, true); // 4
    expectedDataView.setUint32(8, mockPacketSize, true); // 256
    expectedDataView.setUint32(12, mockOffset, true); // 0x1000
    const expectedData = new Uint8Array(expectedDataBuffer);

    // Concatenate the expected header and data to form the complete expected packet
    const expectedFullPacket = new Uint8Array([
      ...expectedHeader,
      ...expectedData,
    ]);

    // Compare the generated packet with the expected packet byte by byte
    expect(fullPacket).toEqual(expectedFullPacket);
  });

  it("should correctly handle different valid input values", () => {
    // Test with a different set of realistic parameters
    const customImageLength = 65536; // 64KB
    const customOffset = 0x20000; // Offset for typical firmware
    const customPacketSize = 4096; // Common block size for flash data
    const customNumPackets = Math.ceil(customImageLength / customPacketSize); // 16 packets

    const customFlashBeginCommand = new EspCommandFlashBegin(
      new Uint8Array(customImageLength), // Simulate image of customImageLength
      customOffset,
      customPacketSize,
      customNumPackets,
    );

    const customFullPacket = customFlashBeginCommand.getPacketData();
    const customDataView = new DataView(
      customFullPacket.buffer,
      customFullPacket.byteOffset + 8,
    );

    // Verify the size and data payload for the custom inputs
    expect(customFlashBeginCommand.size).toBe(16);
    expect(customDataView.getUint32(0, true)).toBe(customImageLength);
    expect(customDataView.getUint32(4, true)).toBe(customNumPackets);
    expect(customDataView.getUint32(8, true)).toBe(customPacketSize);
    expect(customDataView.getUint32(12, true)).toBe(customOffset);
  });
});
