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
import { EspCommandSpiSetParams } from "./esp.command.spi-set-params";
import { EspCommand, EspPacketDirection } from "./esp.command";

describe("EspCommandSpiSetParams", () => {
  const totalSize = 4 * 1024 * 1024; // 4MB
  const blockSize = 65536; // 64KB
  const sectorSize = 4096; // 4KB
  const pageSize = 256; // 256 bytes

  let setParamsCommand: EspCommandSpiSetParams;

  beforeEach(() => {
    setParamsCommand = new EspCommandSpiSetParams();
  });

  it("should set the correct command identifier and packet direction", () => {
    // SPI_SET_PARAMS command is identified by 0x0b
    expect(setParamsCommand.command).toBe(EspCommand.SPI_SET_PARAMS);
    // All host-initiated commands are requests (0x00)
    expect(setParamsCommand.direction).toBe(EspPacketDirection.REQUEST);
  });

  it("should have the correct data payload size", () => {
    // The payload for SPI_SET_PARAMS is 6 * 4 = 24 bytes
    expect(setParamsCommand.size).toBe(24);
  });

  it("should set the checksum to zero", () => {
    // Checksum is not used for this command
    expect(setParamsCommand.checksum).toBe(0);
  });

  it("should correctly encode all six 32-bit words in the data payload", () => {
    const dataPayload = setParamsCommand.data;
    const view = new DataView(dataPayload.buffer);

    // 1. id (hardcoded to 0)
    expect(view.getUint32(0, true)).toBe(0);
    // 2. totalSize
    expect(view.getUint32(4, true)).toBe(totalSize);
    // 3. blockSize
    expect(view.getUint32(8, true)).toBe(blockSize);
    // 4. sectorSize
    expect(view.getUint32(12, true)).toBe(sectorSize);
    // 5. pageSize
    expect(view.getUint32(16, true)).toBe(pageSize);
    // 6. statusMask (hardcoded to 0xFFFFFFFF)
    expect(view.getUint32(20, true)).toBe(0xffffffff);
  });

  it("should assemble the complete packet data correctly", () => {
    const fullPacket = setParamsCommand.getPacketData();
    const dataPayload = setParamsCommand.data;

    // Manually create the expected packet for verification (8-byte header + 24-byte data)
    const expectedPacket = new Uint8Array(32);
    const view = new DataView(expectedPacket.buffer);

    // Main 8-byte header
    view.setUint8(0, EspPacketDirection.REQUEST); // 0x00
    view.setUint8(1, EspCommand.SPI_SET_PARAMS); // 0x0b
    view.setUint16(2, 24, true); // Size of payload is 24
    view.setUint32(4, 0, true); // Checksum is 0

    // Set the 24-byte data payload
    expectedPacket.set(dataPayload, 8);

    expect(fullPacket).toEqual(expectedPacket);
  });
});
