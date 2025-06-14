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

import { describe, it, expect, vi, afterEach } from "vitest";
import { BinFilePartition } from "./bin-file-partition";

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("BinFilePartition", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with offset and filename", () => {
    const offset = 0x1000;
    const filename = "bootloader.bin";
    const partition = new BinFilePartition(offset, filename);
    expect(partition.offset).toBe(offset);
    expect(partition.filename).toBe(filename);
    expect(partition.binary).toEqual(new Uint8Array(0));
  });

  it("should load binary data successfully", async () => {
    const mockData = new Uint8Array([1, 2, 3]);
    const mockArrayBuffer = mockData.buffer;
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    });

    const partition = new BinFilePartition(0x1000, "app.bin");
    const success = await partition.load();

    expect(success).toBe(true);
    expect(partition.binary).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith("app.bin");
  });

  it("should return false if fetch fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: "Not Found",
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const partition = new BinFilePartition(0x8000, "partitions.bin");
    const success = await partition.load();

    expect(success).toBe(false);
    expect(partition.binary.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to fetch partitions.bin: Not Found",
    );
    consoleSpy.mockRestore();
  });

  it("should return false on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const partition = new BinFilePartition(0x10000, "ota.bin");
    const success = await partition.load();

    expect(success).toBe(false);
    expect(partition.binary.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error loading file ota.bin:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
