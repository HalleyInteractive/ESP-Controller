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

import { describe, it, expect, beforeEach } from "vitest";
import { NVSPartition } from "./nvs-partition";
import { NVSSettings } from "./nvs-settings";

describe("NVSPartition", () => {
  let partition: NVSPartition;
  const offset = 0x9000;
  const filename = "nvs.bin";

  beforeEach(() => {
    partition = new NVSPartition(offset, filename);
  });

  it("should initialize with a default size and create an initial page", () => {
    expect(partition.offset).toBe(offset);
    expect(partition.filename).toBe(filename);
    expect(partition.size).toBe(0x3000);
    expect(partition.binary.length).toBe(0x3000);
  });

  it("should correctly add a new namespace", () => {
    const namespace = "wifi";
    partition.writeEntry(namespace, "ssid", "my_wifi");
    const binary = partition.binary;
    // Some basic check to see if something was written
    expect(binary[32]).not.toBe(0xff);
  });

  it("should create a new page when the current one is full", () => {
    // FIX: Reduced loop from 200 to 70 to avoid overflowing the partition size.
    // 70 string entries are enough to fill the first page and create a second one.
    for (let i = 0; i < 70; i++) {
      partition.writeEntry("storage", `key${i}`, `value${i}`);
    }
    // A simple check to see if there is more than one page.
    const binary = partition.binary;
    // Check if the second page has been written to (offset by page size)
    expect(binary[NVSSettings.PAGE_SIZE + 32]).not.toBe(0xff);
  });
});
