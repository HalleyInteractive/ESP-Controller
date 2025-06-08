/* SLIP special character codes */
enum SlipStreamBytes {
  END = 0xc0, // Indicates end of packet
  ESC = 0xdb, // Indicates byte stuffing
  ESC_END = 0xdc, // ESC ESC_END means END data byte
  ESC_ESC = 0xdd, // ESC ESC_ESC means ESC data byte
}

/**
 * Indicates if stream transformation should encode
 * or decode.
 */
enum SlipStreamTransformDirection {
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
