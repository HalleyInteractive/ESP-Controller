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

import { describe, it, expect } from "vitest";
import { EntryStateBitmap } from "./state-bitmap";
import { NvsEntryState } from "./nvs-settings";

describe("EntryStateBitmap", () => {
  const initialState =
    0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

  it("should correctly set an entry's state to Written", () => {
    const entryIndex = 5;
    const newState = NvsEntryState.Written; // 0b10

    const updatedBitmap = EntryStateBitmap.setState(
      initialState,
      entryIndex,
      newState,
    );

    const bitPosition = BigInt(entryIndex * 2);
    const mask = 0b11n << bitPosition;
    const value = (updatedBitmap & mask) >> bitPosition;

    expect(value).toBe(BigInt(NvsEntryState.Written));
  });

  it("should correctly set an entry's state to Erased", () => {
    const entryIndex = 10;
    const newState = NvsEntryState.Erased; // 0b00

    const updatedBitmap = EntryStateBitmap.setState(
      initialState,
      entryIndex,
      newState,
    );

    const bitPosition = BigInt(entryIndex * 2);
    const mask = 0b11n << bitPosition;
    const value = (updatedBitmap & mask) >> bitPosition;

    expect(value).toBe(BigInt(NvsEntryState.Erased));
  });

  it("should not affect other entries when setting a state", () => {
    let bitmap = initialState;
    bitmap = EntryStateBitmap.setState(bitmap, 2, NvsEntryState.Written);
    bitmap = EntryStateBitmap.setState(bitmap, 8, NvsEntryState.Erased);

    // Check entry 2
    let bitPosition = BigInt(2 * 2);
    let mask = 0b11n << bitPosition;
    let value = (bitmap & mask) >> bitPosition;
    expect(value).toBe(BigInt(NvsEntryState.Written));

    // Check entry 8
    bitPosition = BigInt(8 * 2);
    mask = 0b11n << bitPosition;
    value = (bitmap & mask) >> bitPosition;
    expect(value).toBe(BigInt(NvsEntryState.Erased));

    // Check an untouched entry (e.g., 5)
    bitPosition = BigInt(5 * 2);
    mask = 0b11n << bitPosition;
    value = (bitmap & mask) >> bitPosition;
    expect(value).toBe(BigInt(NvsEntryState.Empty));
  });

  it("should throw an error for an out-of-bounds entry index", () => {
    expect(() =>
      EntryStateBitmap.setState(initialState, 126, NvsEntryState.Written),
    ).toThrow("Entry index is out of bounds.");
    expect(() =>
      EntryStateBitmap.setState(initialState, -1, NvsEntryState.Written),
    ).toThrow("Entry index is out of bounds.");
  });
});
