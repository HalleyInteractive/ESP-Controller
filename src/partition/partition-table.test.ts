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
import { PartitionTable } from "./partition-table";
import {
  AppPartitionSubType,
  DataPartitionSubType,
  PartitionType,
} from "./partition-types";

describe("PartitionTable", () => {
  it("should generate a valid binary for a simple partition table", () => {
    const table = PartitionTable.singleFactoryAppNoOta();
    const binary = table.toBinary();

    expect(binary.length).toBe(0xc00);

    const view = new DataView(binary.buffer);
    // nvs
    expect(view.getUint32(4, true)).toBe(0x9000);
    // phy_init
    expect(view.getUint32(36, true)).toBe(0xf000);
    // factory
    expect(view.getUint32(68, true)).toBe(0x10000);
  });

  it("should generate a valid binary with MD5 checksum", () => {
    const table = new PartitionTable([
      {
        name: "nvs",
        type: PartitionType.DATA,
        subType: DataPartitionSubType.NVS,
        size: 0x4000,
      },
      {
        name: "otadata",
        type: PartitionType.DATA,
        subType: DataPartitionSubType.OTA,
        size: 0x2000,
      },
      {
        name: "phy_init",
        type: PartitionType.DATA,
        subType: DataPartitionSubType.PHY,
        size: 0x1000,
      },
      {
        name: "factory",
        type: PartitionType.APP,
        subType: AppPartitionSubType.FACTORY,
        size: 1 * 1024 * 1024,
      },
      {
        name: "ota_0",
        type: PartitionType.APP,
        subType: AppPartitionSubType.OTA_0,
        size: 1 * 1024 * 1024,
      },
      {
        name: "ota_1",
        type: PartitionType.APP,
        subType: AppPartitionSubType.OTA_1,
        size: 1 * 1024 * 1024,
      },
    ]);

    const binary = table.toBinary();
    const md5Entry = binary.slice(6 * 32, 6 * 32 + 32);
    expect(md5Entry[0]).toBe(0xeb);
    expect(md5Entry[1]).toBe(0xeb);
  });
});
