/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// REFACTOR: Centralized NvsType enum to avoid duplication.
export enum NvsType {
  U8 = 0x01,
  I8 = 0x11,
  U16 = 0x02,
  I16 = 0x12,
  U32 = 0x04,
  I32 = 0x14,
  U64 = 0x08,
  I64 = 0x18,
  STR = 0x21,
  BLOB = 0x42,
  ANY = 0xff,
}

// NEW: Enum for entry states to improve readability and maintainability.
// Values correspond to the NVS documentation.
export enum NvsEntryState {
  Empty = 0b11,
  Written = 0b10,
  Erased = 0b00,
}

export class NVSSettings {
  static readonly BLOCK_SIZE: number = 32; //
  static readonly PAGE_SIZE: number = 4096; //
  static readonly PAGE_MAX_ENTRIES: number = 126; //
  static readonly PAGE_ACTIVE: number = 0xfffffffe; //
  static readonly PAGE_FULL: number = 0xfffffffc; //
  static readonly NVS_VERSION: number = 0xfe; // version 2
  static readonly DEFAULT_NAMESPACE: string = "storage";
}
