import {
  LineBreakTransformer,
  LoggingTransformer,
  Uint8LoggingTransformer,
} from './utils/transformers';
import {sleep} from './utils/common';

import {
  SlipStreamTransformDirection,
  SlipStreamTransformer,
} from 'serial-line-internet-protocol';
export class PortController {
  private serialOptions: SerialOptions = {
    baudRate: 115200,
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
  private commandWriter: TransformStream<Uint8Array, Uint8Array> | undefined;
  private slipStreamDecoder: SlipStreamTransformer;

  public allRequests: Uint8Array[] = [];
  public allResponses: Uint8Array[] = [];
  public allSerial: Uint8Array[] = [];

  constructor(private readonly port: SerialPort) {
    console.log('New Controller');
    this.slipStreamDecoder = new SlipStreamTransformer(
      SlipStreamTransformDirection.Decoding,
      true
    );
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      console.log('Controller connect to port');

      await this.port.open(this.serialOptions);
      const [stream1, stream2] = this.port.readable.tee();
      this.logStream = this.setupLogStream(stream1);
      this.logReader = this.logStream.getReader();
      this.logReader.read().then(this.processStream.bind(this));

      this.commandStream = stream2;

      this.commandReader = this.commandStream
        .pipeThrough(new TransformStream(this.slipStreamDecoder))
        // .pipeThrough(
        //   new TransformStream<Uint8Array, Uint8Array>(
        //     new Uint8LoggingTransformer()
        //   )
        // )
        .getReader();

      const slipStreamEncoder = new TransformStream(
        new SlipStreamTransformer(SlipStreamTransformDirection.Encoding, true)
      );

      const logingStream = new TransformStream<Uint8Array, Uint8Array>(
        new Uint8LoggingTransformer('WRITING')
      );

      slipStreamEncoder.readable.pipeTo(logingStream.writable);
      logingStream.readable.pipeTo(this.port.writable);
      // slipStreamEncoder.readable.pipeTo(this.port.writable);
      this.commandWriter = slipStreamEncoder;

      this.connected = true;
    }
  }

  reframe() {
    this.slipStreamDecoder.reFrame();
  }

  async disconnect() {
    if (this.connected) {
      await this.logReader?.cancel();
      this.logReader?.releaseLock();
      await this.logStream?.cancel();
      console.log('Disconnected logStream');

      // this.commandReader?.releaseLock();
      await this.commandReader?.cancel();
      // await this.commandStream?.cancel();
      console.log('Disconnected commandStream');

      this.commandWriter?.readable.getReader().releaseLock();
      // this.commandWriter?.readable.cancel();

      await this.port.close();
      console.log('Closed Port');

      this.connected = false;
    }
  }

  async write(data: Uint8Array) {
    const writer = this.commandWriter?.writable.getWriter();
    await writer?.write(data);
    this.allRequests.push(data);
    this.allSerial.push(data);
    writer?.releaseLock();
  }

  async response(timeout: number): Promise<Uint8Array> {
    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      this.commandReader
        ?.read()
        .then((responseData: ReadableStreamDefaultReadResult<Uint8Array>) => {
          if (responseData.value) {
            // console.log('RECEIVED', responseData.value);
            this.allResponses.push(responseData.value);
            this.allSerial.push(responseData.value);
            resolve(responseData.value);
          } else {
            reject('NO RESPONSE DATA');
          }
        });
      sleep(timeout).then(() => {
        reject('TIMEOUT');
      });
    });

    return responsePromise;
  }

  async resetPulse() {
    this.port.setSignals({dataTerminalReady: false, readyToSend: true});
    await sleep(100);
    this.port.setSignals({dataTerminalReady: true, readyToSend: false});
    await sleep(50);
  }

  setupLogStream(stream: ReadableStream<Uint8Array>): ReadableStream<string> {
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
