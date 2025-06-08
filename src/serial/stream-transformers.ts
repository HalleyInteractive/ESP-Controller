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
