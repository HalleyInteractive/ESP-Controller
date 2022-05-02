export class PortController {
  private serialOptions: SerialOptions = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    bufferSize: 255,
    parity: 'none',
    flowControl: 'none',
  };

  connected: Boolean = false;
  private stream: ReadableStream<string> | undefined;
  private reader: ReadableStreamDefaultReader<string> | undefined;

  constructor(private readonly port: SerialPort) {
    console.log('New Controller');
  }

  async connect(): Promise<ReadableStream<Uint8Array>> {
    console.log('Controller connect to port');
    await this.port.open(this.serialOptions);
    const [stream1, stream2] = this.port.readable.tee();
    this.stream = stream1
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TransformStream<string, string>(new LineBreakTransformer())
      )
      .pipeThrough(
        new TransformStream<string, string>(new LoggingTransformer())
      );
    this.reader = this.stream.getReader();
    this.reader.read().then(this.processStream.bind(this));
    return stream2;
  }

  async disconnect() {
    this.connected = false;
    await this.port.close();
  }

  processStream(
    result: ReadableStreamDefaultReadResult<string>
  ): Promise<ReadableStreamDefaultReadValueResult<string> | undefined> {
    if (result?.done) {
      console.log('LAST CHUNK: ', result.value);
    } else {
      console.log('CHUNK: ', result?.value);
      if (this?.reader) {
        return this.reader?.read().then(this.processStream.bind(this));
      }
    }
    return new Promise(resolve => {
      resolve(undefined);
    });
  }
}

export class LoggingTransformer implements Transformer<string, string> {
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>
  ) {
    console.log('STREAM LOG: ', chunk);
    controller.enqueue(chunk);
  }
}

export class LineBreakTransformer implements Transformer<string, string> {
  buffer: string | undefined = '';
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>
  ) {
    this.buffer += chunk;
    const lines = this.buffer?.split('\r\n');
    this.buffer = lines?.pop();
    lines?.forEach(line => controller.enqueue(line));
  }
}
