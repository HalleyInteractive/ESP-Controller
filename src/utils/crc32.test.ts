// src/utils/crc32.test.ts
/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from "vitest";
import { crc32 } from "./crc32";

describe("crc32", () => {
  const textEncoder = new TextEncoder();

  it("should compute the correct CRC32 for an empty buffer", () => {
    const input = new Uint8Array([]);
    const expected = new Uint8Array([255, 255, 255, 255]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it("should compute the correct CRC32 for a simple ASCII string", () => {
    const input = textEncoder.encode("hello world");
    const expected = new Uint8Array([150, 95, 50, 153]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it('should compute the correct CRC32 for the standard test vector "123456789"', () => {
    const input = textEncoder.encode("123456789");
    const expected = new Uint8Array([119, 210, 2, 210]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it('should compute the correct CRC32 for the standard test vector "The quick brown fox jumps over the lazy dog"', () => {
    const input = textEncoder.encode(
      "The quick brown fox jumps over the lazy dog",
    );
    const expected = new Uint8Array([247, 247, 57, 70]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it("should compute the correct CRC32 for a buffer with various byte values", () => {
    const input = new Uint8Array([
      0x01, 0x02, 0x03, 0x04, 0x05, 0x00, 0xff, 0xfe,
    ]);
    const expected = new Uint8Array([125, 232, 33, 41]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it("should handle buffers with a length not divisible by 8", () => {
    const input = textEncoder.encode("short"); // length 5
    const expected = new Uint8Array([64, 152, 245, 182]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });
});
