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

import { Partition } from "./partition";
import { PartitionEntry } from "./partition-entry";
import {
  AppPartitionSubType,
  DataPartitionSubType,
  PartitionDefinition,
  PartitionType,
} from "./partition-types";
import SparkMD5 from "spark-md5";

const PARTITION_TABLE_OFFSET = 0x8000;
const PARTITION_TABLE_SIZE = 0x1000;
const MD5_PARTITION_BEGIN = new Uint8Array([
  0xeb,
  0xeb,
  ...Array(14).fill(0xff),
]);

export class PartitionTable implements Partition {
  private entries: PartitionEntry[] = [];
  public readonly offset = PARTITION_TABLE_OFFSET;
  public readonly filename = "partition-table.bin";

  constructor(definitions: PartitionDefinition[]) {
    this.processDefinitions(definitions);
  }

  private processDefinitions(definitions: PartitionDefinition[]) {
    let lastEnd = PARTITION_TABLE_OFFSET + PARTITION_TABLE_SIZE;

    for (const definition of definitions) {
      if (!definition.offset) {
        const alignment =
          definition.type === PartitionType.APP ? 0x10000 : 0x1000;
        if (lastEnd % alignment !== 0) {
          lastEnd += alignment - (lastEnd % alignment);
        }
        definition.offset = lastEnd;
      }
      this.entries.push(new PartitionEntry(definition));
      lastEnd = definition.offset + definition.size;
    }
  }

  public async load(): Promise<boolean> {
    return true;
  }

  get binary(): Uint8Array {
    return this.toBinary();
  }

  public toBinary(enableMD5 = true): Uint8Array {
    let binary = new Uint8Array();
    for (const entry of this.entries) {
      binary = new Uint8Array([...binary, ...entry.toBinary()]);
    }

    if (enableMD5) {
      // Use SparkMD5.ArrayBuffer.hash for binary data
      const checksum = SparkMD5.ArrayBuffer.hash(binary, true);
      const md5Entry = new Uint8Array([
        ...MD5_PARTITION_BEGIN,
        ...new Uint8Array(checksum),
      ]);
      binary = new Uint8Array([...binary, ...md5Entry]);
    }

    const padding = new Uint8Array(PARTITION_TABLE_SIZE - binary.length).fill(
      0xff,
    );
    return new Uint8Array([...binary, ...padding]);
  }

  public static singleFactoryAppNoOta(): PartitionTable {
    return new PartitionTable([
      {
        name: "nvs",
        type: PartitionType.DATA,
        subType: DataPartitionSubType.NVS,
        size: 0x6000,
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
        size: 1024 * 1024,
      },
    ]);
  }

  public static factoryAppTwoOtaDefinitions(): PartitionTable {
    return new PartitionTable([
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
        size: 1024 * 1024,
      },
      {
        name: "ota_0",
        type: PartitionType.APP,
        subType: AppPartitionSubType.OTA_0,
        size: 1024 * 1024,
      },
      {
        name: "ota_1",
        type: PartitionType.APP,
        subType: AppPartitionSubType.OTA_1,
        size: 1024 * 1024,
      },
    ]);
  }
}
