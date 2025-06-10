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

/**
 * Returns a promise with a timeout for set milliseconds.
 * @param ms milliseconds to wait
 * @returns Promise that resolves after set ms.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function to format a byte array into a hex string
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* SLIP special character codes */
export enum SlipStreamBytes {
  END = 0xc0, // Indicates end of packet
  ESC = 0xdb, // Indicates byte stuffing
  ESC_END = 0xdc, // ESC ESC_END means END data byte
  ESC_ESC = 0xdd, // ESC ESC_ESC means ESC data byte
}

/**
 * Encode buffer using RFC 1055 (SLIP) standard
 * @param buffer
 * @returns Uint8Array buffer encoded.
 */
export function slipEncode(buffer: Uint8Array): Uint8Array {
  const encoded = [SlipStreamBytes.END];
  for (const byte of buffer) {
    if (byte === SlipStreamBytes.END) {
      encoded.push(SlipStreamBytes.ESC, SlipStreamBytes.ESC_END);
    } else if (byte === SlipStreamBytes.ESC) {
      encoded.push(SlipStreamBytes.ESC, SlipStreamBytes.ESC_ESC);
    } else {
      encoded.push(byte);
    }
  }
  encoded.push(SlipStreamBytes.END);
  return new Uint8Array(encoded);
}
