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

import { describe, it, expect, beforeAll } from "vitest";
import { NVSPartition } from "./nvs-partition";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { NvsEntry } from "./nvs-entry";
import { NVSSettings, NvsType } from "./nvs-settings";

describe("NVS Binary Generation from CSV", () => {
  let tsBinary: Uint8Array;
  let pythonBinary: Uint8Array;

  // Load and parse the CSV data immediately so it's available for describe.each
  const csvPath = path.resolve(__dirname, "binary-test/sample_0x6000.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    comment: "#",
  });

  // Helper function to map encoding string to NvsType enum
  const getNVSTypeFromEncoding = (encoding: string): NvsType => {
    switch (encoding) {
      case "u8":
        return NvsType.U8;
      case "i8":
        return NvsType.I8;
      case "u16":
        return NvsType.U16;
      case "i16":
        return NvsType.I16;
      case "u32":
        return NvsType.U32;
      case "i32":
        return NvsType.I32;
      case "string":
        return NvsType.STR;
      default:
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
  };

  beforeAll(() => {
    // 2. Create and populate the NVSPartition from the CSV data
    const nvsPartition = new NVSPartition(0x9000, "nvs_partition", 0x6000);

    let currentNamespace = "";
    for (const record of records) {
      if (record.type === "namespace") {
        currentNamespace = record.key;
      } else if (record.type === "data") {
        let value: string | number = record.value;
        if (
          record.encoding.startsWith("i") ||
          record.encoding.startsWith("u")
        ) {
          value = Number(record.value);
        }
        nvsPartition.writeEntry(currentNamespace, record.key, value);
      }
    }

    // 3. Get the generated binary from the TypeScript implementation
    tsBinary = nvsPartition.binary;

    // 4. Load the pre-generated binary from the Python tool
    const pythonBinaryPath = path.resolve(
      __dirname,
      "binary-test/sample_0x6000.bin",
    );
    pythonBinary = new Uint8Array(fs.readFileSync(pythonBinaryPath).buffer);
  });

  it("should generate a binary of the correct length", () => {
    expect(tsBinary.length).toEqual(pythonBinary.length);
  });

  describe("Page Structure", () => {
    it("should have an identical page header", () => {
      const tsHeader = tsBinary.slice(0, 32);
      const pythonHeader = pythonBinary.slice(0, 32);
      expect(tsHeader).toEqual(pythonHeader);
    });

    it("should have an identical state bitmap", () => {
      const tsBitmap = tsBinary.slice(32, 64);
      const pythonBitmap = pythonBinary.slice(32, 64);
      expect(tsBitmap).toEqual(pythonBitmap);
    });
  });

  describe("NVS Entries", () => {
    // Test for the namespace entry
    it("should have a correct namespace entry", () => {
      const entryOffset = 2 * NVSSettings.BLOCK_SIZE;
      const tsEntry = tsBinary.slice(
        entryOffset,
        entryOffset + NVSSettings.BLOCK_SIZE,
      );
      const pythonEntry = pythonBinary.slice(
        entryOffset,
        entryOffset + NVSSettings.BLOCK_SIZE,
      );
      expect(tsEntry).toEqual(pythonEntry);
    });

    // Dynamically create tests for each data entry
    describe.each(
      records
        .filter((r) => r.type === "data")
        .map((r, i) => ({ ...r, index: i + 1 })),
    )("Entry for key: $key", ({ key, encoding, value, index }) => {
      it("should have the correct entry data", () => {
        const entryOffset = (2 + index) * NVSSettings.BLOCK_SIZE;
        const entry = new NvsEntry({
          namespaceIndex: 1, // Assuming 'storage' is the first namespace at index 1
          key,
          type: getNVSTypeFromEncoding(encoding), // Correctly determine the type
          data:
            encoding.startsWith("i") || encoding.startsWith("u")
              ? Number(value)
              : value,
        });

        const tsEntryBlock = tsBinary.slice(
          entryOffset,
          entryOffset + entry.entriesNeeded * NVSSettings.BLOCK_SIZE,
        );
        const pythonEntryBlock = pythonBinary.slice(
          entryOffset,
          entryOffset + entry.entriesNeeded * NVSSettings.BLOCK_SIZE,
        );

        expect(tsEntryBlock).toEqual(pythonEntryBlock);
      });
    });
  });

  it("should generate a fully identical binary file", () => {
    expect(tsBinary).toEqual(pythonBinary);
  });
});
