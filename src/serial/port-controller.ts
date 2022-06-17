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
  private logStream: ReadableStream<string> | undefined;
  private logReader: ReadableStreamDefaultReader<string> | undefined;
  private commandStream: ReadableStream<Uint8Array> | undefined;
  private commandReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  constructor(private readonly port: SerialPort) {
    console.log('New Controller');
  }

  async connect(): Promise<void> {
    if(!this.connected) {
      console.log('Controller connect to port');

      await this.port.open(this.serialOptions);
      const [stream1, stream2] = this.port.readable.tee();
      this.logStream = this.setupLogStream(stream1);
      this.logReader = this.logStream.getReader();
      this.logReader.read().then(this.processStream.bind(this));

      this.commandStream = stream2;
      this.connected = true;
    }
  }

  async disconnect() {
    if(this.connected) {
      await this.logReader?.cancel();
      this.logReader?.releaseLock();
      await this.logStream?.cancel();
      console.log('Disconnected logStream');

      // TODO: When command stream is implemented change to this.commandReader?....
      const commandStreamReader = await this.commandStream?.getReader();
      await commandStreamReader?.cancel();
      commandStreamReader?.releaseLock();
      await this.commandStream?.cancel();
      console.log('Disconnected commandStream');

      await this.port.close();
      console.log('Closed Port');

      this.connected = false;
    }
  }

  setupLogStream(stream:ReadableStream<Uint8Array>): ReadableStream<string> {
    return stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TransformStream<string, string>(new LineBreakTransformer())
      )
      .pipeThrough(
        new TransformStream<string, string>(new LoggingTransformer())
      );
  }

  processStream(
    result: ReadableStreamDefaultReadResult<string>
  ): Promise<ReadableStreamDefaultReadValueResult<string> | undefined> {
    if (!result?.done && this?.logReader && this.connected) {
      return this.logReader?.read().then(this.processStream.bind(this));
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
