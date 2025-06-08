/* SLIP special character codes */
enum SlipStreamBytes {
  END = 0xc0, // Indicates end of packet
  ESC = 0xdb, // Indicates byte stuffing
  ESC_END = 0xdc, // ESC ESC_END means END data byte
  ESC_ESC = 0xdd, // ESC ESC_ESC means ESC data byte
}

class LoggingTransformer implements Transformer<string, string> {
  constructor(public logPrefix: string = "STREAM LOG: ") {}
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>,
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

class Uint8LoggingTransformer implements Transformer<Uint8Array, Uint8Array> {
  constructor(public logPrefix: string = "UINT8 STREAM LOG: ") {}
  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

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
 * SlipStreamTransformer is the transformer implementation.
 * arguments:
 * @param {SlipStreamTransformDirection} mode set to encode or decode.
 * @param {boolean} startWithEnd indicates if encoding should also start with the END byte.
 */
export class SlipStreamTransformer
  implements Transformer<Uint8Array, Uint8Array>
{
  private decoding = false;
  private escape = false;
  private frame: number[] = [];

  constructor(private mode: "encoding" | "decoding") {
    if (this.mode === "encoding") {
      this.decoding = false;
    }
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (this.mode === "decoding") {
      for (const byte of chunk) {
        if (this.decoding) {
          if (this.escape) {
            if (byte === SlipStreamBytes.ESC_END) {
              this.frame.push(SlipStreamBytes.END);
            } else if (byte === SlipStreamBytes.ESC_ESC) {
              this.frame.push(SlipStreamBytes.ESC);
            } else {
              this.frame.push(byte);
            }
            this.escape = false;
          } else if (byte === SlipStreamBytes.ESC) {
            this.escape = true;
          } else if (byte === SlipStreamBytes.END) {
            if (this.frame.length > 0) {
              controller.enqueue(new Uint8Array(this.frame));
            }
            this.frame = [];
          } else {
            this.frame.push(byte);
          }
        } else if (byte === SlipStreamBytes.END) {
          this.decoding = true;
          this.frame = [];
          this.escape = false;
        }
      }
    } else {
      // Corrected Encoding Logic:
      // The transform method now only buffers the escaped bytes.
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
      // The flush method now wraps the buffered frame with END bytes
      // and enqueues the entire packet as a single chunk.
      const finalPacket = new Uint8Array([
        SlipStreamBytes.END,
        ...this.frame,
        SlipStreamBytes.END,
      ]);
      controller.enqueue(finalPacket);
    }
    // The decoder does not need any specific flush logic.
  }
}

/**
 * Creates a TransformStream that logs to console.
 * @returns TransformStream
 */
export function createLoggingTransformer() {
  return new TransformStream<string, string>(new LoggingTransformer());
}

/**
 * Creates a TransformStream that logs to console.
 * @returns TransformStream
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
 * @example
 * const transformedStream = stream.pipeThrough(new SlipStreamEncoder());
 */
export class SlipStreamEncoder extends TransformStream {
  constructor() {
    super(new SlipStreamTransformer("encoding"));
  }
}

/**
 * TranformStream that decodes data according to the RFC 1055 (SLIP) standard.
 * @example
 * const transformedStream = stream.pipeThrough(new SlipStreamDecoder());
 */
export class SlipStreamDecoder extends TransformStream {
  constructor() {
    super(new SlipStreamTransformer("decoding"));
  }
}
