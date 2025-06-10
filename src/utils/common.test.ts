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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep, slipEncode, SlipStreamBytes, toHex } from "./common";

describe("sleep", () => {
  // Enable fake timers before each test in this suite
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // Restore real timers after each test
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve after the specified number of milliseconds", async () => {
    const sleepDuration = 5000; // 5 seconds
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    // Start the sleep promise. It will not resolve yet.
    const sleepPromise = sleep(sleepDuration);

    // Assert that the timer was set correctly
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      sleepDuration,
    );

    // Fast-forward time until the timer is scheduled to run
    await vi.advanceTimersByTimeAsync(sleepDuration);

    // Now, awaiting the promise should complete instantly
    // If it doesn't resolve, the test will time out and fail.
    await expect(sleepPromise).resolves.toBeUndefined();
  });

  it("should not resolve before the specified timeout has passed", async () => {
    const sleepDuration = 3000; // 3 seconds
    let hasResolved = false;

    // Call sleep and update the flag upon resolution
    sleep(sleepDuration).then(() => {
      hasResolved = true;
    });

    // Advance time by slightly less than the full duration
    await vi.advanceTimersByTimeAsync(sleepDuration - 1);

    // At this point, the promise should still be pending
    expect(hasResolved).toBe(false);

    // Advance time by the final millisecond
    await vi.advanceTimersByTimeAsync(1);

    // Now the promise should have resolved
    expect(hasResolved).toBe(true);
  });
});

describe("toHex", () => {
  it("should return an empty string for an empty array", () => {
    const bytes = new Uint8Array([]);
    expect(toHex(bytes)).toBe("");
  });

  it("should correctly format a single byte", () => {
    const bytes = new Uint8Array([0x4a]);
    expect(toHex(bytes)).toBe("4a");
  });

  it("should correctly format multiple bytes", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0xab, 0xcd]);
    expect(toHex(bytes)).toBe("0102abcd");
  });

  it("should correctly pad single-digit hex values with a leading zero", () => {
    const bytes = new Uint8Array([0x0f, 0x0a, 0x01]);
    expect(toHex(bytes)).toBe("0f0a01");
  });

  it("should handle zero and max values correctly", () => {
    const bytes = new Uint8Array([0x00, 0xff]);
    expect(toHex(bytes)).toBe("00ff");
  });
});

describe("slipEncode", () => {
  it("should frame an empty buffer with END bytes", () => {
    const buffer = new Uint8Array([]);
    const expected = new Uint8Array([SlipStreamBytes.END, SlipStreamBytes.END]);
    expect(slipEncode(buffer)).toEqual(expected);
  });

  it("should only frame a buffer that contains no special characters", () => {
    const buffer = new Uint8Array([0x01, 0x02, 0x03]);
    const expected = new Uint8Array([
      SlipStreamBytes.END,
      0x01,
      0x02,
      0x03,
      SlipStreamBytes.END,
    ]);
    expect(slipEncode(buffer)).toEqual(expected);
  });

  it("should escape SlipStreamBytes.END bytes within the buffer", () => {
    const buffer = new Uint8Array([SlipStreamBytes.END]);
    const expected = new Uint8Array([
      SlipStreamBytes.END,
      SlipStreamBytes.ESC,
      SlipStreamBytes.ESC_END,
      SlipStreamBytes.END,
    ]);
    expect(slipEncode(buffer)).toEqual(expected);
  });

  it("should escape SlipStreamBytes.ESC bytes within the buffer", () => {
    const buffer = new Uint8Array([SlipStreamBytes.ESC]);
    const expected = new Uint8Array([
      SlipStreamBytes.END,
      SlipStreamBytes.ESC,
      SlipStreamBytes.ESC_ESC,
      SlipStreamBytes.END,
    ]);
    expect(slipEncode(buffer)).toEqual(expected);
  });

  it("should escape a mix of SlipStreamBytes.END and SlipStreamBytes.ESC bytes", () => {
    const buffer = new Uint8Array([
      0x01,
      SlipStreamBytes.END,
      0x02,
      SlipStreamBytes.ESC,
      0x03,
    ]);
    const expected = new Uint8Array([
      SlipStreamBytes.END,
      0x01,
      SlipStreamBytes.ESC,
      SlipStreamBytes.ESC_END,
      0x02,
      SlipStreamBytes.ESC,
      SlipStreamBytes.ESC_ESC,
      0x03,
      SlipStreamBytes.END,
    ]);
    expect(slipEncode(buffer)).toEqual(expected);
  });

  it("should correctly handle special characters at the beginning and end of the buffer", () => {
    const buffer = new Uint8Array([
      SlipStreamBytes.END,
      0x01,
      0x02,
      SlipStreamBytes.ESC,
    ]);
    const expected = new Uint8Array([
      SlipStreamBytes.END,
      SlipStreamBytes.ESC,
      SlipStreamBytes.ESC_END,
      0x01,
      0x02,
      SlipStreamBytes.ESC,
      SlipStreamBytes.ESC_ESC,
      SlipStreamBytes.END,
    ]);
    expect(slipEncode(buffer)).toEqual(expected);
  });
});
