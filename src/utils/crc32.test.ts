import { describe, it, expect } from "vitest";
import { crc32 } from "./crc32";

describe("crc32", () => {
  const textEncoder = new TextEncoder();

  it("should compute the correct CRC32 for an empty buffer", () => {
    const input = new Uint8Array([]);
    const expected = new Uint8Array([0, 0, 0, 0]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it("should compute the correct CRC32 for a simple ASCII string", () => {
    const input = textEncoder.encode("hello world");
    // CRC32 for "hello world" is 0x0d4a1185
    const expected = new Uint8Array([0x85, 0x11, 0x4a, 0x0d]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it('should compute the correct CRC32 for the standard test vector "123456789"', () => {
    const input = textEncoder.encode("123456789");
    // CRC32 for "123456789" is 0xcbf43926
    const expected = new Uint8Array([0x26, 0x39, 0xf4, 0xcb]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  it('should compute the correct CRC32 for the standard test vector "The quick brown fox jumps over the lazy dog"', () => {
    const input = textEncoder.encode(
      "The quick brown fox jumps over the lazy dog",
    );
    // CRC32 for this string is 0x414fa339
    const expected = new Uint8Array([0x39, 0xa3, 0x4f, 0x41]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  // 👇 CORRECTED TEST CASE
  it("should compute the correct CRC32 for a buffer with various byte values", () => {
    const input = new Uint8Array([
      0x01, 0x02, 0x03, 0x04, 0x05, 0x00, 0xff, 0xfe,
    ]);
    // The correct CRC32 for this buffer is 0xb3fcc8eb
    const expected = new Uint8Array([0xeb, 0xc8, 0xfc, 0xb3]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });

  // 👇 CORRECTED TEST CASE
  it("should handle buffers with a length not divisible by 8", () => {
    const input = textEncoder.encode("short"); // length 5
    // The correct CRC32 for "short" is 0x8f2890a2
    const expected = new Uint8Array([0xa2, 0x90, 0x28, 0x8f]);
    const result = crc32(input);
    expect(result).toEqual(expected);
  });
});
