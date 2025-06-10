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
import { PartitionEntry } from "./partition-entry";
import { PartitionType, PartitionSubType } from "./partition-types";

describe("PartitionEntry", () => {
  it("should create a valid binary representation", () => {
    const entry = new PartitionEntry({
      name: "nvs",
      type: PartitionType.DATA,
      subType: PartitionSubType.NVS,
      offset: 0x9000,
      size: 0x6000,
    });

    const binary = entry.toBinary();
    const view = new DataView(binary.buffer);

    expect(binary.length).toBe(32);
    expect(view.getUint8(0)).toBe(0xaa);
    expect(view.getUint8(1)).toBe(0x50);
    expect(view.getUint8(2)).toBe(PartitionType.DATA);
    expect(view.getUint8(3)).toBe(PartitionSubType.NVS);
    expect(view.getUint32(4, true)).toBe(0x9000);
    expect(view.getUint32(8, true)).toBe(0x6000);

    const textDecoder = new TextDecoder();
    expect(textDecoder.decode(binary.slice(12, 12 + 3))).toBe("nvs");
  });

  it("should throw an error for a long name", () => {
    expect(() => {
      new PartitionEntry({
        name: "this is a very long partition name",
        type: PartitionType.APP,
        subType: PartitionSubType.FACTORY,
        offset: 0x10000,
        size: 0x100000,
      });
    }).toThrow("Partition name cannot be longer than 16 characters.");
  });
});
