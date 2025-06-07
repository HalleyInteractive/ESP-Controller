/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Typescript implementation of RFC 1055.
 * https://datatracker.ietf.org/doc/html/rfc1055
 *
 */

/* SLIP special character codes */
export enum SlipStreamBytes {
  END = 0xc0, // Indicates end of packet
  ESC = 0xdb, // Indicates byte stuffing
  ESC_END = 0xdc, // ESC ESC_END means END data byte
  ESC_ESC = 0xdd, // ESC ESC_ESC means ESC data byte
}

/**
 * Indicates if stream transformation should encode
 * or decode.
 */
export enum SlipStreamTransformDirection {
  Encoding = "encoding",
  Decoding = "decoding",
}

/**
 * Result of a decoded chunk, this might be
 * half-way of a frame.
 */
interface DecodeResult {
  bufferFrames: number[][];
  endBytes: number;
}

/**
 * SlipStreamTransformer is the transformer implementation.
 * arguments:
 * @param {SlipStreamTransformDirection} direction set to encode or decode.
 * @param {boolean} startWithEnd indicates if encoding should also start with the END byte.
 */
export class SlipStreamTransformer implements Transformer {
  private localBuffer: number[] = [];
  private endBytes = 0;

  constructor(
    public direction: SlipStreamTransformDirection = SlipStreamTransformDirection.Encoding,
    public startWithEnd: boolean = true,
  ) {}

  /**
   * Transform is called for every chunk that flows through the stream.
   * @param chunk Chunk to encode or decode.
   * @param controller TranformstreamDefaultController
   */
  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (this.direction === SlipStreamTransformDirection.Encoding) {
      const buffer = this.encode(chunk);

      if (this.startWithEnd) {
        buffer.unshift(SlipStreamBytes.END);
      }
      buffer.push(SlipStreamBytes.END);

      controller.enqueue(new Uint8Array(buffer));
    } else {
      const { bufferFrames, endBytes } = this.decode(chunk);
      this.endBytes += endBytes;
      const minEndBytes = this.startWithEnd ? 2 : 1;
      while (this.endBytes >= minEndBytes) {
        this.endBytes -= minEndBytes;
        const frame = bufferFrames.shift();
        if (frame) {
          this.localBuffer.push(...frame);
        }
        controller.enqueue(new Uint8Array(this.localBuffer));
        this.localBuffer = [];
      }
      const frame = bufferFrames.shift();
      if (frame) {
        this.localBuffer.push(...frame);
      }
    }
  }

  /**
   * When framing stream by 2 End Bytes it might be out of sync with the packets
   * Use this method to skip one end byte and get the stream in sync again.
   */
  reFrame() {
    this.endBytes += 1;
  }

  /**
   * Encodes the chunks, looks for the special bytes to encode.
   * @param data Chunk of the stream to encode
   * @returns encoded chunk
   */
  private encode(data: Uint8Array): number[] {
    const buffer: number[] = [];
    for (const byte of Array.from(data.values())) {
      switch (byte) {
        case SlipStreamBytes.END:
          buffer.push(SlipStreamBytes.ESC);
          buffer.push(SlipStreamBytes.ESC_END);
          break;
        case SlipStreamBytes.ESC:
          buffer.push(SlipStreamBytes.ESC);
          buffer.push(SlipStreamBytes.ESC_ESC);
          break;
        default:
          buffer.push(byte);
          break;
      }
    }
    return buffer;
  }

  /**
   * Decodes the chunks in the stream,
   * looks for the special bytes and removes them.
   * @param data Chunk of data in the stream to decode.
   * @returns decoded chunk.
   */
  private decode(data: Uint8Array): DecodeResult {
    let endBytes = 0;
    const bufferFrames: number[][] = [];
    let buffer: number[] = [];
    const dataValues = Array.from(data.values());
    for (const [index, byte] of dataValues.entries()) {
      switch (byte) {
        case SlipStreamBytes.ESC_END:
          if (dataValues?.[index - 1] === SlipStreamBytes.ESC) {
            buffer.push(SlipStreamBytes.END);
          } else {
            buffer.push(SlipStreamBytes.ESC_END);
          }
          break;
        case SlipStreamBytes.ESC_ESC:
          if (dataValues?.[index - 1] === SlipStreamBytes.ESC) {
            buffer.push(SlipStreamBytes.ESC);
          } else {
            buffer.push(SlipStreamBytes.ESC_ESC);
          }
          break;
        case SlipStreamBytes.ESC:
          // No action needed
          break;
        case SlipStreamBytes.END:
          if (buffer.length > 0) {
            if (!this.startWithEnd || this.endBytes > 0 || endBytes > 0) {
              bufferFrames.push([...buffer]);
            }
          }
          buffer = [];
          endBytes++;
          break;
        default:
          buffer.push(byte);
          break;
      }
    }
    if (buffer.length > 0) {
      bufferFrames.push([...buffer]);
    }
    return { bufferFrames, endBytes };
  }
}

/**
 * TranformStream that encodes data according to the RFC 1055 (SLIP) standard.
 * @example
 * const transformedStream = stream.pipeThrough(new SlipStreamEncoder());
 */
export class SlipStreamEncoder extends TransformStream {
  constructor() {
    super(
      new SlipStreamTransformer(SlipStreamTransformDirection.Encoding, true),
    );
  }
}

/**
 * TranformStream that decodes data according to the RFC 1055 (SLIP) standard.
 * @example
 * const transformedStream = stream.pipeThrough(new SlipStreamDecoder());
 */
export class SlipStreamDecoder extends TransformStream {
  constructor() {
    super(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, true),
    );
  }
}
