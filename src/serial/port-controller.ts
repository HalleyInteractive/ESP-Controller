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

import {
  LineBreakTransformer,
  LoggingTransformer,
} from "../utils/stream-transformers";
import { sleep } from "../utils/common";

import {
  SlipStreamTransformDirection,
  SlipStreamTransformer,
} from "./slip-protocol";
export class PortController {
  private serialOptions: SerialOptions = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    bufferSize: 255,
    parity: "none",
    flowControl: "none",
  };

  connected: boolean = false;
  // private logStream:
  //   | ReadableStream<string>
  //   | ReadableStream<Uint8Array>
  //   | undefined;
  private logReader: ReadableStreamDefaultReader<string> | undefined;
  // private commandStream: ReadableStream<Uint8Array> | undefined;
  // private commandReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private slipStreamDecoder: TransformStream<Uint8Array, Uint8Array>;
  private slipStreamEncoder: TransformStream<Uint8Array, Uint8Array>;
  private textDecoder: TextDecoderStream;
  private lineBreakTransformer: TransformStream<string, string>;
  private loggingTransfomer: TransformStream<string, string>;
  private abortStreamController: AbortController | undefined;
  private commandReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  constructor(private readonly port: SerialPort) {
    console.log("New Controller");
    this.slipStreamDecoder = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, true),
    );
    this.slipStreamEncoder = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Encoding, true),
    );
    this.textDecoder = new TextDecoderStream();
    this.lineBreakTransformer = new TransformStream<string, string>(
      new LineBreakTransformer(),
    );
    this.loggingTransfomer = new TransformStream<string, string>(
      new LoggingTransformer(),
    );
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      console.log("Controller connect to port");

      this.abortStreamController = new AbortController();
      const streamPipeOptions = {
        signal: this.abortStreamController.signal,
        preventCancel: false,
        preventClose: false,
        preventAbort: false,
      };

      await this.port.open(this.serialOptions);
      const [stream1, stream2] = this.port.readable.tee();

      this.logReader = stream1
        .pipeThrough(this.textDecoder, streamPipeOptions)
        .pipeThrough(this.lineBreakTransformer, streamPipeOptions)
        .getReader();

      this.commandReader = stream2
        .pipeThrough(this.slipStreamDecoder, streamPipeOptions)
        .getReader();

      this.slipStreamEncoder.readable.pipeTo(
        this.port.writable,
        streamPipeOptions,
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
      await sleep(1000);
      // this.abortStreamController?.abort('User disconnects');
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

  async resetPulse() {
    this.port.setSignals({ dataTerminalReady: false, readyToSend: true });
    await sleep(100);
    this.port.setSignals({ dataTerminalReady: true, readyToSend: false });
    await sleep(50);
  }

  async *logStream() {
    try {
      while (this.connected) {
        const result = await this.logReader?.read();
        if (result?.done) return;
        yield result?.value;
      }
    } finally {
      this.logReader?.releaseLock();
    }
  }

  async *commandStream() {
    try {
      while (this.connected) {
        const result = await this.commandReader?.read();
        if (result?.done) return;
        yield result?.value;
      }
    } finally {
      this.commandReader?.releaseLock();
    }
  }
}
