import { describe, it, expect } from "vitest";
import { PartitionTable } from "./partition-table";
import {
  AppPartitionSubType,
  DataPartitionSubType,
  PartitionDefinition,
  PartitionType,
} from "./partition-types";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse/sync";

interface PartitionCsvRecord {
  Name: string;
  Type: string;
  SubType: string;
  Offset: string;
  Size: string;
  Flags: string;
}

// Helper function to parse CSV content into PartitionDefinition array
const parseCsvToPartitionDefinitions = (csv: string): PartitionDefinition[] => {
  const records: PartitionCsvRecord[] = parse(csv, {
    columns: ["Name", "Type", "SubType", "Offset", "Size", "Flags"],
    skip_empty_lines: true,
    comment: "#",
    trim: true,
    relax_column_count: true,
  });

  return records.map((record: PartitionCsvRecord) => {
    const parseSize = (s: string): number => {
      if (!s) return 0;
      if (s.toLowerCase().endsWith("m")) {
        return parseInt(s.slice(0, -1), 10) * 1024 * 1024;
      } else if (s.toLowerCase().endsWith("k")) {
        return parseInt(s.slice(0, -1), 10) * 1024;
      }
      return parseInt(s, 0);
    };

    const typeStr = record.Type.toUpperCase();
    const subTypeStr = record.SubType.toUpperCase();

    const definition: PartitionDefinition = {
      name: record.Name,
      type: PartitionType[typeStr as keyof typeof PartitionType],
      subType:
        AppPartitionSubType[subTypeStr as keyof typeof AppPartitionSubType] ??
        DataPartitionSubType[subTypeStr as keyof typeof DataPartitionSubType],
      size: parseSize(record.Size),
    };

    if (record.Offset) {
      definition.offset = parseInt(record.Offset, 0);
    }

    if (record.Flags) {
      definition.flags = {
        encrypted: record.Flags.includes("encrypted"),
        readonly: record.Flags.includes("readonly"),
      };
    }

    return definition;
  });
};

describe("PartitionTable from binary-test files", () => {
  const binaryTestDir = resolve(__dirname, "binary-test");

  const testCases = [
    {
      csvFile: "single_factory_app_no_ota.csv",
      binFile: "single_factory_app_no_ota.bin",
    },
    {
      csvFile: "factory_app_two_ota.csv",
      binFile: "factory_app_two_ota.bin",
    },
    {
      csvFile: "custom_partitions_table.csv",
      binFile: "custom_partitions_table.bin",
    },
  ];

  for (const { csvFile, binFile } of testCases) {
    describe(`${csvFile}`, () => {
      const csvPath = resolve(binaryTestDir, csvFile);
      const binPath = resolve(binaryTestDir, binFile);

      const csvContent = readFileSync(csvPath, "utf-8");
      const expectedBinary = new Uint8Array(readFileSync(binPath));
      const partitionDefinitions = parseCsvToPartitionDefinitions(csvContent);
      const table = new PartitionTable(partitionDefinitions);
      const generatedBinary = table.toBinary();

      it("should have the correct number of entries", () => {
        // The last entry is the MD5 checksum
        const expectedNumEntries = table["entries"].length + 1;
        // Each entry is 32 bytes
        const actualNumEntries =
          expectedBinary.findIndex(
            (byte, index) =>
              index > 0 &&
              index % 32 === 0 &&
              expectedBinary.slice(index).every((b) => b === 0xff),
          ) / 32;
        expect(actualNumEntries).toBe(expectedNumEntries);
      });

      it("should have matching partition entries", () => {
        const generatedEntries = generatedBinary.slice(
          0,
          table["entries"].length * 32,
        );
        const expectedEntries = expectedBinary.slice(
          0,
          table["entries"].length * 32,
        );
        expect(generatedEntries).toEqual(expectedEntries);
      });

      it("should have a matching MD5 checksum entry", () => {
        const md5EntryOffset = table["entries"].length * 32;
        const generatedMd5Entry = generatedBinary.slice(
          md5EntryOffset,
          md5EntryOffset + 32,
        );
        const expectedMd5Entry = expectedBinary.slice(
          md5EntryOffset,
          md5EntryOffset + 32,
        );
        expect(generatedMd5Entry).toEqual(expectedMd5Entry);
      });

      it("should have matching padding", () => {
        const md5EntryOffset = table["entries"].length * 32;
        const paddingStart = md5EntryOffset + 32;
        const generatedPadding = generatedBinary.slice(paddingStart);
        const expectedPadding = expectedBinary.slice(paddingStart);
        expect(generatedPadding).toEqual(expectedPadding);
      });

      it("should generate a binary that matches the official tool's output", () => {
        expect(generatedBinary).toEqual(expectedBinary);
      });
    });
  }
});
