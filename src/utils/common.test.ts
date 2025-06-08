import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep } from "./common";

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
