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
import { EspCommandReadReg } from "./command.read-reg";
import { EspCommand, EspPacketDirection } from "./command";

describe("EspCommandReadReg", () => {
  // Example address from the trace in the protocol documentation
  const address = 0x40001000;
  let readRegCommand: EspCommandReadReg;

  beforeEach(() => {
    readRegCommand = new EspCommandReadReg(address);
  });

  it("should set the correct command identifier and packet direction", () => {
    // READ_REG command is identified by 0x0a
    expect(readRegCommand.command).toBe(EspCommand.READ_REG);
    // All host-initiated commands are requests (0x00)
    expect(readRegCommand.direction).toBe(EspPacketDirection.REQUEST);
  });

  it("should have the correct data payload size", () => {
    // The payload for READ_REG is a 4-byte address
    expect(readRegCommand.size).toBe(4);
  });

  it("should set the checksum to zero", () => {
    // Checksum is not used for READ_REG and should be 0
    expect(readRegCommand.checksum).toBe(0);
  });

  it("should correctly encode the address in the data payload in little-endian format", () => {
    const dataPayload = readRegCommand.data;
    const dataView = new DataView(dataPayload.buffer);

    // The payload should be 4 bytes long
    expect(dataPayload.length).toBe(4);
    // The 32-bit address should be encoded correctly
    expect(dataView.getUint32(0, true)).toBe(address);

    // Verify raw bytes for a known address 0x40001000 -> 00 10 00 40
    expect(dataPayload[0]).toBe(0x00);
    expect(dataPayload[1]).toBe(0x10);
    expect(dataPayload[2]).toBe(0x00);
    expect(dataPayload[3]).toBe(0x40);
  });

  it("should assemble the complete packet data correctly", () => {
    const fullPacket = readRegCommand.getPacketData();
    const dataPayload = readRegCommand.data;

    // Manually create the expected packet for verification (8-byte header + 4-byte data)
    const expectedPacket = new Uint8Array(12);
    const view = new DataView(expectedPacket.buffer);

    // Main 8-byte header
    view.setUint8(0, EspPacketDirection.REQUEST); // 0x00
    view.setUint8(1, EspCommand.READ_REG); // 0x0a
    view.setUint16(2, 4, true); // Size of payload is 4
    view.setUint32(4, 0, true); // Checksum is 0

    // Set the 4-byte data payload
    expectedPacket.set(dataPayload, 8);

    expect(fullPacket).toEqual(expectedPacket);

    const expectedPacketFromTable = new Uint8Array(12);
    const tableView = new DataView(expectedPacketFromTable.buffer);
    tableView.setUint8(0, 0x00); // Direction
    tableView.setUint8(1, 0x0a); // Command
    tableView.setUint16(2, 4, true); // Size
    tableView.setUint32(4, 0, true); // Checksum
    tableView.setUint32(8, address, true); // Data

    expect(readRegCommand.getPacketData()).toEqual(expectedPacketFromTable);
  });
});
