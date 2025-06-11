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
  private stateBitmap = BigInt(
    "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
  );
  private entries: NvsEntry[] = [];
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
    const crcData: Uint8Array = this.pageHeader.slice(4, 28);
    this.headerCRC32.set(crc32(crcData));
  }

  private _calculateItemHash(
    namespaceIndex: number,
    key: string,
    chunkIndex: number,
  ): number {
    const hashData = `${namespaceIndex}:${key}:${chunkIndex}`;
    const fullCrc = crc32(new TextEncoder().encode(hashData));
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
      // FIX: This error message now matches the test expectation.
      throw new Error("Page is full and locked. Cannot write new entries.");
    }

    const entryKv: NvsKeyValue = {
      namespaceIndex,
      key,
      data,
      type: this.getNVSEncoding(data),
    };
    const entry = new NvsEntry(entryKv);

    if (entry.entriesNeeded + this.entryNumber > NVSSettings.PAGE_MAX_ENTRIES) {
      this.setPageState("FULL");
      throw new Error("Entry doesn't fit on the page");
    }

    const hash = this._calculateItemHash(namespaceIndex, key, entry.chunkIndex);
    this.itemHashMap.set(hash, this.entryNumber);
    this.entries.push(entry);

    for (let i = 0; i < entry.entriesNeeded; i++) {
      this.stateBitmap = EntryStateBitmap.setState(
        this.stateBitmap,
        this.entryNumber + i,
        NvsEntryState.Written,
      );
    }

    this.entryNumber += entry.entriesNeeded;
    return entry;
  }

  public findEntry(
    key: string,
    namespaceIndex: number,
    chunkIndex = 0xff,
  ): NvsEntry | undefined {
    const hash = this._calculateItemHash(namespaceIndex, key, chunkIndex);
    const potentialIndex = this.itemHashMap.get(hash);

    if (potentialIndex !== undefined) {
      const entry = this.entries[potentialIndex];
      if (
        entry &&
        entry.key === key &&
        entry.namespaceIndex === namespaceIndex &&
        entry.chunkIndex === chunkIndex
      ) {
        return entry;
      }
    }

    return this.entries.find(
      (e) =>
        e.key === key &&
        e.namespaceIndex === namespaceIndex &&
        e.chunkIndex === chunkIndex,
    );
  }

  public setPageState(state: NvsPageState) {
    if (state === "FULL") {
      this.headerPageState.set(
        new Uint8Array(new Uint32Array([NVSSettings.PAGE_FULL]).buffer),
      );
      this.isStateLocked = true;
    } else if (state === "ACTIVE") {
      this.headerPageState.set(
        new Uint8Array(new Uint32Array([NVSSettings.PAGE_ACTIVE]).buffer),
      );
    } else {
      throw Error("Invalid page state requested");
    }
    this.updateHeaderCrc();
  }

  public getData(): Uint8Array {
    // Write header and state bitmap
    const sbm = new Uint8Array(NVSSettings.BLOCK_SIZE).fill(0xff);
    new DataView(sbm.buffer).setBigUint64(0, this.stateBitmap, true);
    this.pageBuffer.set(this.pageHeader, 0);
    this.pageBuffer.set(sbm, NVSSettings.BLOCK_SIZE);

    // Write entries
    let currentEntrySlot = 0;
    for (const entry of this.entries) {
      const headerOffset = (2 + currentEntrySlot) * NVSSettings.BLOCK_SIZE;
      this.pageBuffer.set(entry.headerBuffer, headerOffset);

      if (entry.dataBuffer.length > 0) {
        const dataOffset = (2 + currentEntrySlot + 1) * NVSSettings.BLOCK_SIZE;
        this.pageBuffer.set(entry.dataBuffer, dataOffset);
      }

      currentEntrySlot += entry.entriesNeeded;
    }

    return this.pageBuffer;
  }
}
