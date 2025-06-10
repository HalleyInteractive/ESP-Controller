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
import { NvsEntry } from "./nvs-entry";
import { NVSSettings, NvsType } from "./nvs-settings";
import { crc32 } from "../utils/crc32";

describe("NvsEntry", () => {
  it("should correctly initialize a primitive U8 entry", () => {
    const entryData = {
      namespace: 1,
      type: NvsType.U8,
      key: "test_key",
      data: 128,
    };
    const entry = new NvsEntry(entryData);

    expect(entry.namespace).toBe(entryData.namespace);
    expect(entry.type).toBe(entryData.type);
    expect(entry.key).toBe(entryData.key + "\0");
    expect(entry.data).toBe(entryData.data);
    expect(entry.entriesNeeded).toBe(1);
    expect(entry.headerBuffer).toBeInstanceOf(Uint8Array);
    expect(entry.dataBuffer.length).toBe(0);
  });

  it("should correctly initialize a string entry", () => {
    const entryData = {
      namespace: 2,
      type: NvsType.STR,
      key: "string_key",
      data: "hello nvs",
    };
    const entry = new NvsEntry(entryData);

    expect(entry.namespace).toBe(entryData.namespace);
    expect(entry.type).toBe(entryData.type);
    expect(entry.key).toBe(entryData.key + "\0");
    expect(entry.data).toBe(entryData.data);
    expect(entry.entriesNeeded).toBe(2); // 1 for header, 1 for data
    expect(entry.dataBuffer.length).toBe(NVSSettings.BLOCK_SIZE); // 1 block for data
  });

  it("should throw an error for keys longer than 15 characters", () => {
    const entryData = {
      namespace: 1,
      type: NvsType.U8,
      key: "this_is_a_very_long_key",
      data: 10,
    };
    // FIX: Corrected the expected length in the error message from 25 to 23.
    expect(() => new NvsEntry(entryData)).toThrow(
      "NVS max key length is 15, received 'this_is_a_very_long_key' of length 23",
    );
  });

  it("should correctly set the header for a primitive entry", () => {
    const entryData = {
      namespace: 1,
      type: NvsType.U32,
      key: "my_u32",
      data: 0xabcdef,
    };
    const entry = new NvsEntry(entryData);
    const headerView = new DataView(entry.headerBuffer.buffer);

    expect(headerView.getUint8(0)).toBe(entryData.namespace);
    expect(headerView.getUint8(1)).toBe(entryData.type);
    expect(headerView.getUint8(2)).toBe(1); // span
    expect(headerView.getUint8(3)).toBe(0xff); // chunkIndex
  });

  it("should calculate the header CRC32 correctly", () => {
    const entryData = {
      namespace: 1,
      type: NvsType.U8,
      key: "test_key",
      data: 42,
    };
    const entry = new NvsEntry(entryData);

    const crcData = new Uint8Array(28);
    crcData.set(entry.headerBuffer.slice(0, 4), 0);
    crcData.set(entry.headerBuffer.slice(8, 32), 4);
    const expectedCrc = crc32(crcData);

    expect(entry.headerCRC32).toEqual(expectedCrc);
  });
});
