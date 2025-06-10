/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law of an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { crc32 } from "../../utils/crc32";
// REFACTOR: Import enums from the central settings file.
import { NVSSettings, NvsType } from "./nvs-settings";

const NVS_BLOCK_SIZE = NVSSettings.BLOCK_SIZE;

export class NvsEntry implements NvsKeyValue {
  namespace: number;
  type: NvsType;
  key: string;
  data: string | number;

  headerNamespace: Uint8Array;
  headerType: Uint8Array;
  headerSpan: Uint8Array;
  headerChunkIndex: Uint8Array;
  headerCRC32: Uint8Array;
  headerKey: Uint8Array;
  headerData: Uint8Array;
  headerDataSize: Uint8Array;
  headerDataCRC32: Uint8Array;

  headerBuffer: Uint8Array;
  dataBuffer: Uint8Array;

  entriesNeeded = 0;

  constructor(entry: NvsKeyValue) {
    this.namespace = entry.namespace;
    this.type = entry.type;
    this.data = entry.data;

    // FIX: Validate key length BEFORE adding null terminator. Max key length is 15 chars.
    if (entry.key.length > 15) {
      throw Error(
        `NVS max key length is 15, received '${entry.key}' of length ${entry.key.length}`,
      );
    }

    // FIX: Avoid side-effects. Don't modify the original `entry` object.
    this.key = entry.key + "\0";

    this.headerBuffer = new Uint8Array(NVS_BLOCK_SIZE);
    this.headerNamespace = new Uint8Array(this.headerBuffer.buffer, 0, 1);
    this.headerType = new Uint8Array(this.headerBuffer.buffer, 1, 1);
    this.headerSpan = new Uint8Array(this.headerBuffer.buffer, 2, 1);
    this.headerChunkIndex = new Uint8Array(this.headerBuffer.buffer, 3, 1).fill(
      0xff,
    );
    this.headerCRC32 = new Uint8Array(this.headerBuffer.buffer, 4, 4);
    this.headerKey = new Uint8Array(this.headerBuffer.buffer, 8, 16);
    this.headerData = new Uint8Array(this.headerBuffer.buffer, 24, 8).fill(
      0xff,
    );
    this.headerDataSize = new Uint8Array(this.headerBuffer.buffer, 24, 4);
    this.headerDataCRC32 = new Uint8Array(this.headerBuffer.buffer, 28, 4);

    this.dataBuffer = new Uint8Array(0);

    this.setEntryData();
    this.setEntryHeader();
    this.setEntryHeaderCRC();
  }

  private setEntryHeader() {
    const encoder = new TextEncoder();
    this.headerNamespace.set([this.namespace]);
    this.headerType.set([this.type]);
    this.headerSpan.set([this.entriesNeeded]);
    this.headerKey.set(encoder.encode(this.key));
  }

  private setEntryData() {
    if (this.type === NvsType.STR) {
      this.setStringEntry();
    } else if (this.type === NvsType.BLOB) {
      // FEATURE: Blob support would be implemented here.
      throw new Error("BLOB type not yet implemented.");
    } else if (typeof this.data === "number") {
      this.setPrimitiveEntry();
    }
  }

  private setStringEntry() {
    if (typeof this.data === "string") {
      const valueWithTerminator = this.data + "\0";
      const encoder = new TextEncoder();
      const data = encoder.encode(valueWithTerminator);

      if (data.length > 4000) {
        throw new Error(
          `String values are limited to 4000 bytes, including null terminator.`,
        );
      }

      this.entriesNeeded = Math.ceil(data.length / NVS_BLOCK_SIZE);
      this.dataBuffer = new Uint8Array(
        this.entriesNeeded * NVS_BLOCK_SIZE,
      ).fill(0xff);
      this.dataBuffer.set(data);

      this.entriesNeeded += 1; // +1 for the header entry

      const dataSizeBuffer = new ArrayBuffer(2);
      const dataSizeView = new DataView(dataSizeBuffer, 0, 2);
      // The stored size includes the null terminator.
      dataSizeView.setUint16(0, data.length, true); // Use little-endian

      this.headerDataSize.set(new Uint8Array(dataSizeBuffer), 0);
      this.headerDataCRC32.set(crc32(data));
    }
  }

  private setPrimitiveEntry() {
    if (typeof this.data === "number") {
      const dataBuffer: ArrayBuffer = new ArrayBuffer(8);
      const dataView: DataView = new DataView(dataBuffer, 0, 8);

      // NVS uses little-endian format. Set the `littleEndian` parameter to true.
      switch (this.type) {
        case NvsType.U8:
          dataView.setUint8(0, this.data);
          break;
        case NvsType.U16:
          dataView.setUint16(0, this.data, true);
          break;
        case NvsType.U32:
          dataView.setUint32(0, this.data, true);
          break;
        case NvsType.U64:
          dataView.setBigUint64(0, BigInt(this.data), true);
          break;
        case NvsType.I8:
          dataView.setInt8(0, this.data);
          break;
        case NvsType.I16:
          dataView.setInt16(0, this.data, true);
          break;
        case NvsType.I32:
          dataView.setInt32(0, this.data, true);
          break;
        case NvsType.I64:
          dataView.setBigInt64(0, BigInt(this.data), true);
          break;
        default:
          throw new Error(`Unsupported primitive type: ${this.type}`);
      }
      this.headerData.set(new Uint8Array(dataBuffer), 0);
    }
    this.entriesNeeded = 1;
  }

  private setEntryHeaderCRC() {
    // CRC is calculated over all fields except the CRC itself.
    // This includes bytes 0-3 (NS, Type, Span, ChunkIdx) and 8-31 (Key, Data).
    const crcData: Uint8Array = new Uint8Array(28);
    crcData.set(this.headerBuffer.slice(0, 4), 0);
    crcData.set(this.headerBuffer.slice(8, 32), 4);
    this.headerCRC32.set(crc32(crcData));
  }
}
