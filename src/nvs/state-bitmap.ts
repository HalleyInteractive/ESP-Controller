// utils/state-bitmap.ts
import { NvsEntryState } from "../nvs-settings";

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

    // Calculate the bit position for the 2-bit state.
    // Each entry takes 2 bits, so we multiply the index by 2.
    const bitPosition = BigInt(entryIndex * 2);

    // 1. Create a mask to clear the 2 bits for the target entry.
    //    e.g., for index 0, mask is ...11111100
    const clearMask = ~(0b11n << bitPosition);

    // 2. Clear the relevant bits in the bitmap.
    const clearedBitmap = currentBitmap & clearMask;

    // 3. Create the new value shifted to the correct position.
    //    e.g., for Written (0b10), value is 0b10 << bitPosition
    const newValue = BigInt(newState) << bitPosition;

    // 4. Combine the cleared bitmap with the new state value.
    return clearedBitmap | newValue;
  },

  /**
   * Gets the state of a given entry from the bitmap.
   * @param currentBitmap The current state bitmap as a BigInt.
   * @param entryIndex The index of the entry to read (0-125).
   * @returns The state of the entry.
   */
  getState(currentBitmap: bigint, entryIndex: number): NvsEntryState {
    if (entryIndex < 0 || entryIndex >= 126) {
      throw new Error("Entry index is out of bounds.");
    }
    const bitPosition = BigInt(entryIndex * 2);
    // Shift the relevant bits to the rightmost position.
    const shifted = currentBitmap >> bitPosition;
    // Mask with 0b11 to get only the two bits.
    return Number(shifted & 0b11n) as NvsEntryState;
  },
};
