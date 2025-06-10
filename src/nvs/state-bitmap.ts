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

import { NvsEntryState } from "./nvs-settings";

/**
 * A helper utility to manage the 126-entry, 252-bit state bitmap.
 * Each entry uses 2 bits to represent its state.
 */
export const EntryStateBitmap = {
  /**
   * Updates the state for a given entry in the bitmap.
   * @param currentBitmap The current state bitmap as a BigInt.
   * @param entryIndex The index of the entry to update (0-125).
   * @param newState The new state for the entry.
   * @returns The updated bitmap as a BigInt.
   */
  setState(
    currentBitmap: bigint,
    entryIndex: number,
    newState: NvsEntryState,
  ): bigint {
    if (entryIndex < 0 || entryIndex >= 126) {
      throw new Error("Entry index is out of bounds.");
    }

    const bitPosition = BigInt(entryIndex * 2);

    // 1. Create a mask to clear the 2 bits for the target entry.
    const clearMask = ~(0b11n << bitPosition);
    const clearedBitmap = currentBitmap & clearMask;

    // 2. Create the new value shifted to the correct position.
    const newValue = BigInt(newState) << bitPosition;

    // 3. Combine the cleared bitmap with the new state value.
    return clearedBitmap | newValue;
  },
};
