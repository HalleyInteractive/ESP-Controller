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

import { SlipStreamBytes } from "../utils/common";

/**
 * A generic string logging transformer.
 * It logs each chunk to the console and passes it through unmodified.
 */
class LoggingTransformer implements Transformer<string, string> {
  /**
   * Constructs a new LoggingTransformer.
   * @param logPrefix A prefix string to prepend to each log message.
   */
  constructor(public logPrefix: string = "STREAM LOG: ") {}
  /**
   * Logs the incoming chunk to the console with the configured prefix
   * and then enqueues it to be passed to the next stage in the stream.
   * @param chunk The string chunk to process.
   * @param controller The TransformStreamDefaultController to enqueue the chunk.
   */
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>,
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

/**
 * A generic Uint8Array logging transformer.
 * It logs each chunk to the console and passes it through unmodified.
 */
class Uint8LoggingTransformer implements Transformer<Uint8Array, Uint8Array> {
  /**
   * Constructs a new Uint8LoggingTransformer.
   * @param logPrefix A prefix string to prepend to each log message.
   */
  constructor(public logPrefix: string = "UINT8 STREAM LOG: ") {}
  /**
   * Logs the incoming chunk to the console with the configured prefix
   * and then enqueues it to be passed to the next stage in the stream.
   * @param chunk The Uint8Array chunk to process.
   * @param controller The TransformStreamDefaultController to enqueue the chunk.
   */
  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

/**
 * A transformer that buffers incoming string chunks and splits them into lines based on `\r\n` separators.
 * It ensures that only complete lines are enqueued. Any partial line at the end of a chunk is buffered
 * and prepended to the next chunk.
 */
class LineBreakTransformer implements Transformer<string, string> {
  buffer: string | undefined = "";
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>,
  ) {
    this.buffer += chunk;
    const lines = this.buffer?.split("\r\n");
    this.buffer = lines?.pop();
    lines?.forEach((line) => controller.enqueue(line));
  }
}

/**
 * Implements the SLIP (Serial Line Internet Protocol) encoding and decoding logic.
 * This transformer can be configured to operate in either encoding or decoding mode.
 */
export class SlipStreamTransformer
  implements Transformer<Uint8Array, Uint8Array>
{
  private decoding = false; // Flag to indicate if the initial END byte for a packet has been received in decoding mode.
  private escape = false; // Flag to indicate if the current byte is an escape character in decoding mode.
  private frame: number[] = []; // Buffer to accumulate bytes for the current frame.

  /**
   * Constructs a new SlipStreamTransformer.
   * @param mode Specifies whether the transformer should operate in "encoding" or "decoding" mode.
   */
  constructor(private mode: "encoding" | "decoding") {
    if (this.mode === "encoding") {
      this.decoding = false; // In encoding mode, 'decoding' state is not used.
    }
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (this.mode === "decoding") {
      for (const byte of chunk) {
        // State machine for decoding SLIP frames
        if (this.decoding) {
          // Currently inside a frame
          if (this.escape) {
            // Previous byte was ESC
            if (byte === SlipStreamBytes.ESC_END) {
              this.frame.push(SlipStreamBytes.END);
            } else if (byte === SlipStreamBytes.ESC_ESC) {
              this.frame.push(SlipStreamBytes.ESC);
            } else {
              // This case should ideally not happen in a valid SLIP stream,
              // but we'll add the byte as is to be robust.
              this.frame.push(byte);
            }
            this.escape = false;
          } else if (byte === SlipStreamBytes.ESC) {
            // Start of an escape sequence
            this.escape = true;
          } else if (byte === SlipStreamBytes.END) {
            // End of the current frame
            if (this.frame.length > 0) {
              controller.enqueue(new Uint8Array(this.frame));
            }
            this.frame = []; // Reset frame buffer for the next packet
            // this.decoding remains true as we might receive multiple packets
          } else {
            // Regular data byte
            this.frame.push(byte);
          }
        } else if (byte === SlipStreamBytes.END) {
          // Start of a new frame (or end of a previous one, signaling start of a new one)
          this.decoding = true;
          this.frame = []; // Clear any previous partial frame data
          this.escape = false;
        }
        // Bytes received before the first END in decoding mode are ignored.
      }
    } else {
      // Encoding mode: Escapes special SLIP bytes (END, ESC) in the input chunk
      // and accumulates them in an internal buffer. The actual packet framing
      // with END bytes is handled in the flush method.
      for (const byte of chunk) {
        if (byte === SlipStreamBytes.END) {
          this.frame.push(SlipStreamBytes.ESC, SlipStreamBytes.ESC_END);
        } else if (byte === SlipStreamBytes.ESC) {
          this.frame.push(SlipStreamBytes.ESC, SlipStreamBytes.ESC_ESC);
        } else {
          this.frame.push(byte);
        }
      }
    }
  }

  flush(controller: TransformStreamDefaultController<Uint8Array>) {
    if (this.mode === "encoding") {
      // For encoding mode, wraps the accumulated frame buffer with SLIP END bytes
      // to form a complete packet, then enqueues it.
      // Only enqueue if there's data to send to avoid empty packets.
      if (this.frame.length > 0) {
        const finalPacket = new Uint8Array([
          SlipStreamBytes.END,
          ...this.frame,
          SlipStreamBytes.END,
        ]);
        controller.enqueue(finalPacket);
        this.frame = []; // Clear the frame buffer after flushing
      }
    }
    // The decoder does not need any specific flush logic, as partial frames
    // are handled by the transform method. Any remaining data in `this.frame`
    // when the stream closes is considered an incomplete packet and is discarded.
  }
}

/**
 * Creates a TransformStream that logs string chunks to the console.
 * @returns A new TransformStream instance with a LoggingTransformer.
 */
export function createLoggingTransformer() {
  return new TransformStream<string, string>(new LoggingTransformer());
}

/**
 * Creates a TransformStream that logs Uint8Array chunks to the console.
 * @returns A new TransformStream instance with a Uint8LoggingTransformer.
 */
export function createUint8LoggingTransformer() {
  return new TransformStream<Uint8Array, Uint8Array>(
    new Uint8LoggingTransformer(),
  );
}

/**
 * Creates a TransformStream that returns full lines only.
 * Chunks are saved to buffer until `\r\n` is send.
 * @returns TransformStream
 */
export function createLineBreakTransformer() {
  return new TransformStream<string, string>(new LineBreakTransformer());
}

/**
 * TranformStream that encodes data according to the RFC 1055 (SLIP) standard.
 * It takes a stream of Uint8Array chunks and outputs a stream of Uint8Array chunks
 * where each output chunk represents a SLIP-encoded packet.
 * @example
 * const rawDataStream = getSomeUint8ArrayStream();
 * const slipEncodedStream = rawDataStream.pipeThrough(new SlipStreamEncoder());
 */
export class SlipStreamEncoder extends TransformStream<Uint8Array, Uint8Array> {
  /**
   * Constructs a new SlipStreamEncoder.
   * This sets up the underlying SlipStreamTransformer in "encoding" mode.
   */
  constructor() {
    super(new SlipStreamTransformer("encoding"));
  }
}

/**
 * TranformStream that decodes data according to the RFC 1055 (SLIP) standard.
 * It takes a stream of Uint8Array chunks (potentially partial SLIP packets) and
 * outputs a stream of Uint8Array chunks where each output chunk represents a
 * decoded SLIP frame (the original data without SLIP framing and escaping).
 * @example
 * const slipEncodedStream = getSomeSlipEncodedStream();
 * const decodedDataStream = slipEncodedStream.pipeThrough(new SlipStreamDecoder());
 */
export class SlipStreamDecoder extends TransformStream<Uint8Array, Uint8Array> {
  /**
   * Constructs a new SlipStreamDecoder.
   * This sets up the underlying SlipStreamTransformer in "decoding" mode.
   */
  constructor() {
    super(new SlipStreamTransformer("decoding"));
  }
}
