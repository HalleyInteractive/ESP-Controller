/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may
 * obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NVSPage } from "./nvs-page";
import { NVSSettings, NvsEntryState, NvsType } from "./nvs-settings";
import { NvsEntry } from "./nvs-entry";
import { crc32 } from "../utils/crc32";
import { EntryStateBitmap } from "./state-bitmap";

// Mocking dependencies
vi.mock("../utils/crc32", () => ({
  crc32: vi.fn().mockReturnValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef])),
}));

vi.mock("./nvs-entry");

describe("NVSPage", () => {
  let page: NVSPage;
  const pageNumber = 3;
  const version = 2;

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    vi.clearAllMocks();

    // Mock NvsEntry constructor and properties for consistent testing
    vi.mocked(NvsEntry).mockImplementation(
      (entryKv: {
        namespace: number;
        key: string;
        data: string | number;
        type: NvsType;
      }) =>
        ({
          entriesNeeded: 1, // Default to 1, can be overridden in specific tests
          chunkIndex: 0xff,
          headerBuffer: new Uint8Array(32).fill(0xaa),
          dataBuffer: new Uint8Array(32).fill(0xbb),
          key: entryKv.key,
          namespaceIndex: entryKv.namespace,
          data: entryKv.data,
        }) as NvsEntry,
    );

    page = new NVSPage(pageNumber, version);
  });

  it("should initialize correctly with constructor values", () => {
    expect(page.pageNumber).toBe(pageNumber);
    expect(page.version).toBe(version);

    const pageData = page.getData();
    const headerView = new DataView(pageData.buffer, 0, 32);

    // Check Page State (should be ACTIVE: 0xfffffffe)
    expect(headerView.getUint32(0, true)).toBe(NVSSettings.PAGE_ACTIVE);
    // Check Page Number
    expect(headerView.getUint8(4)).toBe(pageNumber);
    // Check Page Version
    expect(headerView.getUint8(8)).toBe(version);
  });

  it("should calculate and set the header CRC32 on initialization", async () => {
    const pageData = page.getData();
    const headerCrc = new Uint8Array(pageData.buffer, 28, 4);

    // Check that crc32 was called on the correct slice of the header
    expect(crc32).toHaveBeenCalledWith(expect.any(Uint8Array));
    // Check that the mocked CRC value was written to the header
    expect(headerCrc).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  describe("writeEntry", () => {
    it("should successfully write a new entry", () => {
      const key = "testKey";
      const data = 123;
      const namespaceIndex = 1;

      const entry = page.writeEntry(key, data, namespaceIndex);

      expect(entry).toBeDefined();
      expect(entry.key).toBe(key);
      expect(entry.data).toBe(data);
      expect(NvsEntry).toHaveBeenCalledWith({
        namespace: namespaceIndex,
        key,
        data,
        type: NvsType.U8,
      });

      // Check if entry is findable
      const foundEntry = page.findEntry(key, namespaceIndex);
      expect(foundEntry).toBe(entry);
    });

    it("should throw an error if the entry does not fit", () => {
      // Mock that NvsEntry needs more space than available
      vi.mocked(NvsEntry).mockImplementation(
        () =>
          ({
            entriesNeeded: NVSSettings.PAGE_MAX_ENTRIES + 1,
          }) as NvsEntry,
      );

      expect(() => page.writeEntry("overflow", 1, 1)).toThrow(
        "Entry doesn't fit on the page",
      );
    });

    it("should set page state to FULL when an entry fills it up", () => {
      // Simulate the page having only one entry slot left by modifying the private property
      Object.assign(page, { entryNumber: NVSSettings.PAGE_MAX_ENTRIES - 1 });

      page.writeEntry("lastEntry", 456, 1);

      // Now the page should be considered full, and the next write will fail inside writeEntry before the check
      expect(() => page.writeEntry("oneTooMany", 789, 1)).toThrow(
        "Entry doesn't fit on the page",
      );

      const pageData = page.getData();
      const headerView = new DataView(pageData.buffer, 0, 4);
      expect(headerView.getUint32(0, true)).toBe(NVSSettings.PAGE_FULL);
    });

    it("should throw an error when trying to write to a locked (FULL) page", () => {
      page.setPageState("FULL");
      expect(() => page.writeEntry("test", 1, 1)).toThrow(
        "Page is full and locked. Cannot write new entries.",
      );
    });
  });

  describe("findEntry", () => {
    it("should find an existing entry", () => {
      const key = "findMe";
      const data = "some data";
      const namespaceIndex = 2;
      const writtenEntry = page.writeEntry(key, data, namespaceIndex);

      const foundEntry = page.findEntry(key, namespaceIndex);
      expect(foundEntry).toBeDefined();
      expect(foundEntry).toBe(writtenEntry);
    });

    it("should return undefined for a non-existent entry", () => {
      const foundEntry = page.findEntry("nonExistent", 1);
      expect(foundEntry).toBeUndefined();
    });

    it("should handle hash collisions by falling back to a linear search", () => {
      // Spy on the private method and force all calls to return the same hash to create a collision.
      const calculateHashSpy = vi
        .spyOn(
          page as unknown as {
            _calculateItemHash: (
              ns: number,
              key: string,
              chunkIndex: number,
            ) => number;
          },
          "_calculateItemHash",
        )
        .mockReturnValue(12345); // All calls will now return this hash

      const entry1 = page.writeEntry("key1", 100, 1);
      page.writeEntry("key2", 200, 2);

      // The hash map would only store the index for the second entry ('key2').
      // We now try to find the first entry ('key1'), which should trigger a linear scan.
      const foundEntry = page.findEntry("key1", 1);

      expect(foundEntry).toBeDefined();
      expect(foundEntry).toBe(entry1);
      expect(calculateHashSpy).toHaveBeenCalledTimes(3); // write1, write2, find
    });
  });

  describe("setPageState", () => {
    it("should set the page state to FULL and lock the page", () => {
      page.setPageState("FULL");
      const pageData = page.getData();
      const headerView = new DataView(pageData.buffer, 0, 4);

      expect(headerView.getUint32(0, true)).toBe(NVSSettings.PAGE_FULL);
      expect(() => page.writeEntry("a", 1, 1)).toThrow(
        "Page is full and locked. Cannot write new entries.",
      );
    });

    it("should set the page state to ACTIVE", () => {
      page.setPageState("FULL"); // Start with FULL
      page.setPageState("ACTIVE"); // Change to ACTIVE
      const pageData = page.getData();
      const headerView = new DataView(pageData.buffer, 0, 4);

      expect(headerView.getUint32(0, true)).toBe(NVSSettings.PAGE_ACTIVE);
    });

    it("should throw an error for an invalid state", () => {
      // Use a type assertion to test a case not allowed by TypeScript's types
      type NvsPageState = Parameters<NVSPage["setPageState"]>[0];
      expect(() =>
        page.setPageState("INVALID_STATE" as unknown as NvsPageState),
      ).toThrow("Invalid page state requested");
    });
  });

  describe("getData", () => {
    it("should return the full page buffer with correct header, bitmap, and entry data", () => {
      const entry = page.writeEntry("dataKey", "hello", 1);
      const pageData = page.getData();

      expect(pageData).toBeInstanceOf(Uint8Array);
      expect(pageData.length).toBe(NVSSettings.PAGE_SIZE);

      // 1. Check Header
      const headerView = new DataView(
        pageData.buffer,
        0,
        NVSSettings.BLOCK_SIZE,
      );
      expect(headerView.getUint8(4)).toBe(pageNumber);

      // 2. Check State Bitmap
      // The first entry is 'Written' (0b10), all others are 'Empty' (0b11)
      const stateBitmapView = new DataView(
        pageData.buffer,
        NVSSettings.BLOCK_SIZE,
        NVSSettings.BLOCK_SIZE,
      );
      const stateBitmap = stateBitmapView.getBigUint64(0, true);
      // We expect the result based on a 64-bit integer, which is what's written to the buffer
      const expectedBitmap = EntryStateBitmap.setState(
        0xffffffffffffffffn, // 64-bit BigInt literal
        0,
        NvsEntryState.Written,
      );
      expect(stateBitmap).toBe(expectedBitmap);

      // 3. Check Entry Data
      const entryHeaderOffset = NVSSettings.BLOCK_SIZE * 2;
      const entryDataOffset = entryHeaderOffset + NVSSettings.BLOCK_SIZE;

      expect(pageData.slice(entryHeaderOffset, entryHeaderOffset + 32)).toEqual(
        entry.headerBuffer,
      );
      expect(pageData.slice(entryDataOffset, entryDataOffset + 32)).toEqual(
        entry.dataBuffer,
      );
    });
  });
});
