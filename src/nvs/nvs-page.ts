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

import { NvsEntry } from "./nvs-entry";
import { crc32 } from "../utils/crc32";
import { NVSSettings, NvsType, NvsEntryState } from "./nvs-settings";
import { EntryStateBitmap } from "./state-bitmap";

export class NVSPage {
  private entryNumber = 0;
  private pageBuffer: Uint8Array;
  private pageHeader: Uint8Array;
  // Initialize with all bits set to 1, representing the 'Empty' state (0b11) for all entries.
  private stateBitmap = BigInt(
    "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
  );
  private entries: NvsEntry[] = [];
  // Optimization: A map of a 24-bit hash to an entry's index for faster lookups.
  private itemHashMap = new Map<number, number>();

  private headerPageState: Uint8Array;
  private headerPageNumber: Uint8Array;
  private headerVersion: Uint8Array;
  private headerCRC32: Uint8Array;
  private isStateLocked = false;

  constructor(
    public pageNumber: number,
    public version: number,
  ) {
    this.pageBuffer = new Uint8Array(NVSSettings.PAGE_SIZE).fill(0xff);
    this.pageHeader = new Uint8Array(this.pageBuffer.buffer, 0, 32);
    this.headerPageState = new Uint8Array(this.pageHeader.buffer, 0, 4);
    this.headerPageNumber = new Uint8Array(this.pageHeader.buffer, 4, 4);
    this.headerVersion = new Uint8Array(this.pageHeader.buffer, 8, 1);
    this.headerCRC32 = new Uint8Array(this.pageHeader.buffer, 28, 4);
    this.setPageHeader();
  }

  private setPageHeader() {
    this.setPageState("ACTIVE");
    this.headerPageNumber.set([this.pageNumber]);
    this.headerVersion.set([this.version]);
    this.updateHeaderCrc();
  }

  private updateHeaderCrc() {
    // CRC32 is calculated over bytes 4 to 28 of the header.
    const crcData: Uint8Array = this.pageHeader.slice(4, 28);
    this.headerCRC32.set(crc32(crcData));
  }

  /**
   * Calculates a 24-bit hash for an entry based on its namespace, key, and chunk index.
   * @param namespaceIndex - The index of the namespace.
   * @param key - The key string.
   * @param chunkIndex - The chunk index of the entry.
   * @returns A 24-bit hash number.
   */
  private _calculateItemHash(
    namespaceIndex: number,
    key: string,
    chunkIndex: number,
  ): number {
    const hashData = `${namespaceIndex}:${key}:${chunkIndex}`;
    const fullCrc = crc32(new TextEncoder().encode(hashData));
    // Truncate the 32-bit CRC to 24 bits as per documentation.
    return new DataView(fullCrc.buffer).getUint32(0, true) & 0x00ffffff;
  }

  private getNVSEncoding(value: number | string): NvsType {
    if (typeof value === "string") {
      return NvsType.STR;
    }
    const isNegative = value < 0;
    const absValue = Math.abs(value);
    if (isNegative) {
      if (absValue <= 0x80) return NvsType.I8;
      if (absValue <= 0x8000) return NvsType.I16;
      if (absValue <= 0x80000000) return NvsType.I32;
      return NvsType.I64;
    } else {
      if (absValue <= 0xff) return NvsType.U8;
      if (absValue <= 0xffff) return NvsType.U16;
      if (absValue <= 0xffffffff) return NvsType.U32;
      return NvsType.U64;
    }
  }

  public writeEntry(
    key: string,
    data: string | number,
    namespaceIndex: number,
  ): NvsEntry {
    if (this.isStateLocked) {
      throw new Error("Page is full and locked. Cannot write new entries.");
    }

    const entryKv: NvsKeyValue = {
      namespaceIndex: namespaceIndex,
      key,
      data,
      type: this.getNVSEncoding(data),
    };
    const entry: NvsEntry = new NvsEntry(entryKv);

    if (entry.entriesNeeded + this.entryNumber > NVSSettings.PAGE_MAX_ENTRIES) {
      this.setPageState("FULL");
      throw new Error("Entry doesn't fit on the page");
    }

    // Add to the hash list for optimized searching.
    const hash = this._calculateItemHash(namespaceIndex, key, entry.chunkIndex);
    this.itemHashMap.set(hash, this.entryNumber);

    this.entries.push(entry);

    for (let i = 0; i < entry.entriesNeeded; i++) {
      const entryIndex = this.entryNumber + i;
      this.stateBitmap = EntryStateBitmap.setState(
        this.stateBitmap,
        entryIndex,
        NvsEntryState.Written,
      );
    }

    this.entryNumber += entry.entriesNeeded;
    return entry;
  }

  /**
   * Finds an entry on the page using the optimized hash list.
   * Falls back to a linear scan if the hash is not found or a collision occurs.
   * @param key - The key of the entry to find.
   * @param namespaceIndex - The namespace of the entry.
   * @param chunkIndex - The chunk index of the entry (defaults to 0xff for non-blob types).
   * @returns The found NvsEntry, or undefined if not found.
   */
  public findEntry(
    key: string,
    namespaceIndex: number,
    chunkIndex = 0xff,
  ): NvsEntry | undefined {
    const hash = this._calculateItemHash(namespaceIndex, key, chunkIndex);
    const potentialIndex = this.itemHashMap.get(hash);

    if (potentialIndex !== undefined) {
      const entry = this.entries[potentialIndex];
      // Verify if this is the correct entry to handle hash collisions.
      if (
        entry &&
        entry.key === key &&
        entry.namespaceIndex === namespaceIndex &&
        entry.chunkIndex === chunkIndex
      ) {
        return entry;
      }
    }

    // Fallback: linear search if hash not found or in case of a collision.
    return this.entries.find(
      (entry) =>
        entry.key === key &&
        entry.namespaceIndex === namespaceIndex &&
        entry.chunkIndex === chunkIndex,
    );
  }

  public setPageState(state: NvsPageState) {
    if (state === "FULL") {
      this.headerPageState
        .fill(0)
        .set(new Uint8Array(new Uint32Array([NVSSettings.PAGE_FULL]).buffer));
      this.isStateLocked = true;
    } else if (state === "ACTIVE") {
      this.headerPageState
        .fill(0)
        .set(new Uint8Array(new Uint32Array([NVSSettings.PAGE_ACTIVE]).buffer));
    } else {
      throw Error("Invalid page state requested");
    }
    this.updateHeaderCrc();
  }

  public getData(): Uint8Array {
    const sbm = new Uint8Array(NVSSettings.BLOCK_SIZE).fill(0xff);
    const sbmView = new DataView(sbm.buffer, 0);
    sbmView.setBigUint64(0, this.stateBitmap, true); // Use little-endian

    // Finalize page buffer before returning
    this.pageBuffer.set(this.pageHeader, 0);
    this.pageBuffer.set(sbm, NVSSettings.BLOCK_SIZE);

    let offset = NVSSettings.BLOCK_SIZE * 2;
    for (const entry of this.entries) {
      this.pageBuffer.set(entry.headerBuffer, offset);
      this.pageBuffer.set(entry.dataBuffer, offset + NVSSettings.BLOCK_SIZE);
      offset += entry.headerBuffer.length + entry.dataBuffer.length;
    }
    return this.pageBuffer;
  }
}
