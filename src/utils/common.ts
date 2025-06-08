/**
 * Returns a promise with a timeout for set milliseconds.
 * @param ms milliseconds to wait
 * @returns Promise that resolves after set ms.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
