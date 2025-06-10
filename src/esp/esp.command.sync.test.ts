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

import { describe, it, expect } from "vitest";
import { EspCommandSync } from "./esp.command.sync";
import { EspPacketDirection, EspCommand } from "./esp.command"; // Assumed import

describe("EspCommandSync", () => {
  it("should initialize with the correct properties for a sync packet", () => {
    // Arrange: Define the expected data payload for the sync command.
    const expectedData = new Uint8Array([
      0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
      0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
      0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    ]);

    // Act: Create a new instance of the command packet.
    const packet = new EspCommandSync();

    // Assert: Verify that all properties of the new packet are correct.
    expect(packet.direction).toBe(EspPacketDirection.REQUEST);
    expect(packet.command).toBe(EspCommand.SYNC);
    expect(packet.data).toEqual(expectedData);
    expect(packet.checksum).toBe(0);
  });
});
