import {
  LineBreakTransformer,
  LoggingTransformer,
} from '../utils/stream-transformers';
import {sleep} from '../utils/common';

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
  private logStream:
    | ReadableStream<string>
    | ReadableStream<Uint8Array>
    | undefined;
  private logReader: ReadableStreamDefaultReader<string> | undefined;
  private commandStream: ReadableStream<Uint8Array> | undefined;
  private commandReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private slipStreamDecoder: TransformStream<Uint8Array, Uint8Array>;
  private slipStreamEncoder: TransformStream<Uint8Array, Uint8Array>;
  private textDecoder: TextDecoderStream;
  private lineBreakTransformer: TransformStream<string, string>;
  private loggingTransfomer: TransformStream<string, string>;
  private abortStreamController: AbortController | undefined;

  constructor(private readonly port: SerialPort) {
    console.log('New Controller');
    this.slipStreamDecoder = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, true)
    );
    this.slipStreamEncoder = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Encoding, true)
    );
    this.textDecoder = new TextDecoderStream();
    this.lineBreakTransformer = new TransformStream<string, string>(
      new LineBreakTransformer()
    );
    this.loggingTransfomer = new TransformStream<string, string>(
      new LoggingTransformer()
    );
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      console.log('Controller connect to port');

      this.abortStreamController = new AbortController();
      const streamPipeOptions = {
        signal: this.abortStreamController.signal,
        preventCancel: false,
        preventClose: false,
        preventAbort: false,
      };

      await this.port.open(this.serialOptions);
      [this.logStream, this.commandStream] = this.port.readable.tee();
      this.logStream = this.logStream
        .pipeThrough(this.textDecoder, streamPipeOptions)
        .pipeThrough(this.lineBreakTransformer, streamPipeOptions)
        .pipeThrough(this.loggingTransfomer, streamPipeOptions);

      this.logReader = this.logStream.getReader();
      this.logReader.read().then(this.processStream.bind(this));

      this.commandReader = this.commandStream
        .pipeThrough(this.slipStreamDecoder, streamPipeOptions)
        .getReader();

      this.slipStreamEncoder.readable.pipeTo(
        this.port.writable,
        streamPipeOptions
      );

      this.connected = true;
    }
  }

  reframe() {
    // this.slipStreamDecoder.reFrame();
  }

  async disconnect() {
    if (this.connected) {
      this.connected = false;
      this.abortStreamController?.abort('User disconnects');
      await this.commandReader?.releaseLock();
      await this.logReader?.releaseLock();
      await this.port.close();
    }
  }

  async write(data: Uint8Array) {
    const writer = this.slipStreamEncoder?.writable.getWriter();
    await writer?.write(data);
    writer?.releaseLock();
  }

  async response(timeout: number): Promise<Uint8Array> {
    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      this.commandReader
        ?.read()
        .then((responseData: ReadableStreamDefaultReadResult<Uint8Array>) => {
          if (responseData.value) {
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
