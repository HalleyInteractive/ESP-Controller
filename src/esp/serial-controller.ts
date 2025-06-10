/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createLineBreakTransformer,
  SlipStreamDecoder,
} from "./stream-transformers";
import { sleep, toHex } from "../utils/common";
import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";
import { EspCommandSync } from "./command.sync";
import { EspCommandSpiAttach } from "./command.spi-attach";
import { EspCommandSpiSetParams } from "./command.spi-set-params";
import { ESPImage } from "../image/image";
import { EspCommandFlashData } from "./command.flash-data";
import { EspCommandFlashBegin } from "./command.flash-begin";
import { Partition } from "../partition/partition";

/**
 * Default serial options when connecting to an ESP32.
 */
const DEFAULT_ESP32_SERIAL_OPTIONS: SerialOptions = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  bufferSize: 255,
  parity: "none",
  flowControl: "none",
};

/**
 * Interface defining the properties of a serial connection.
 */
export interface SerialConnection {
  /** The underlying SerialPort object. Undefined if no port is selected. */
  port: SerialPort | undefined;
  /** Indicates if the serial port is currently open and connected. */
  connected: boolean;
  /** Indicates if the connection has been synchronized with the device. */
  synced: boolean;
  /** The readable stream for receiving data from the serial port. Null if not connected. */
  readable: ReadableStream<Uint8Array> | null;
  /** The writable stream for sending data to the serial port. Null if not connected. */
  writable: WritableStream<Uint8Array> | null;
  /** An AbortController to signal termination of stream operations. Undefined if not connected. */
  abortStreamController: AbortController | undefined;
  /** A readable stream that contains the slipstream decoded responses from the esp. */
  commandResponseStream: ReadableStream<Uint8Array> | undefined;
}

export class SerialController {
  public connection: SerialConnection;

  constructor() {
    this.connection = this.createSerialConnection();
  }

  private createSerialConnection(): SerialConnection {
    return {
      port: undefined,
      connected: false,
      synced: false,
      readable: null,
      writable: null,
      abortStreamController: undefined,
      commandResponseStream: undefined,
    };
  }

  public async requestPort(): Promise<void> {
    this.connection.port = await navigator.serial.requestPort();
    this.connection.synced = false;
  }

  public createLogStreamReader(): () => AsyncGenerator<
    string | undefined,
    void,
    unknown
  > {
    if (
      !this.connection.connected ||
      !this.connection.readable ||
      !this.connection.abortStreamController
    )
      return async function* logStream() {};

    const streamPipeOptions = {
      signal: this.connection.abortStreamController.signal,
      preventCancel: false,
      preventClose: false,
      preventAbort: false,
    };

    const [newReadable, logReadable] = this.connection.readable.tee();
    this.connection.readable = newReadable;

    const reader = logReadable
      .pipeThrough(new TextDecoderStream(), streamPipeOptions)
      .pipeThrough(createLineBreakTransformer(), streamPipeOptions)
      .getReader();

    const connection = this.connection;
    return async function* logStream() {
      try {
        while (connection.connected) {
          const result = await reader?.read();
          if (result?.done) return;
          yield result?.value;
        }
      } finally {
        reader?.releaseLock();
      }
    };
  }

  public async openPort(
    options: SerialOptions = DEFAULT_ESP32_SERIAL_OPTIONS,
  ): Promise<void> {
    if (!this.connection.port?.readable) return;
    await this.connection.port.open(options);

    const [commandTee, logTee] = this.connection.port.readable.tee();

    this.connection.connected = true;
    this.connection.readable = logTee;
    this.connection.writable = this.connection.port.writable;
    this.connection.abortStreamController = new AbortController();
    this.connection.commandResponseStream = commandTee.pipeThrough(
      new SlipStreamDecoder(),
    );
  }

  public async sendResetPulse(): Promise<void> {
    if (!this.connection.port) return;
    this.connection.port.setSignals({
      dataTerminalReady: false,
      requestToSend: true,
    });
    await sleep(100);
    this.connection.port.setSignals({
      dataTerminalReady: true,
      requestToSend: false,
    });
    await sleep(100);
  }

  public async writeToConnection(data: Uint8Array) {
    if (this.connection.writable) {
      const writer = this.connection.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
    }
  }

  public async sync(): Promise<boolean> {
    await this.sendResetPulse();
    const maxAttempts = 10;
    const timeoutPerAttempt = 500; // ms

    const syncCommand = new EspCommandSync();

    for (let i = 0; i < maxAttempts; i++) {
      console.log(`Sync attempt ${i + 1} of ${maxAttempts}`);
      await this.writeToConnection(
        syncCommand.getSlipStreamEncodedPacketData(),
      );

      let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        if (!this.connection.commandResponseStream) {
          throw new Error(`No command response stream available.`);
        }
        responseReader = this.connection.commandResponseStream.getReader();

        const timeoutPromise = sleep(timeoutPerAttempt).then(() => {
          throw new Error(`Timeout after ${timeoutPerAttempt}ms`);
        });

        while (true) {
          const result = await Promise.race([
            responseReader.read(),
            timeoutPromise,
          ]);

          const { value, done } = result;

          if (done) {
            break;
          }

          if (value) {
            const responsePacket = new EspCommandPacket();
            responsePacket.parseResponse(value);

            if (responsePacket.command === EspCommand.SYNC) {
              console.log("SYNCED successfully.", responsePacket);
              this.connection.synced = true;
              return true;
            }
          }
        }
      } catch (e) {
        console.log(`Sync attempt ${i + 1} timed out.`, e);
      } finally {
        if (responseReader) {
          responseReader.releaseLock();
        }
      }

      await sleep(100);
    }

    console.log("Failed to sync with the device.");
    this.connection.synced = false;
    return false;
  }

  private async readResponse(
    expectedCommand: EspCommand,
    timeout = 2000,
  ): Promise<EspCommandPacket> {
    let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      if (!this.connection.commandResponseStream) {
        throw new Error(`No command response stream available.`);
      }
      responseReader = this.connection.commandResponseStream.getReader();
      const timeoutPromise = sleep(timeout).then(() => {
        throw new Error(
          `Timeout: No response received for command ${EspCommand[expectedCommand]} within ${timeout}ms.`,
        );
      });

      while (true) {
        const { value, done } = await Promise.race([
          responseReader.read(),
          timeoutPromise,
        ]);

        if (done) {
          throw new Error(
            "Stream closed unexpectedly while awaiting response.",
          );
        }

        if (value) {
          const responsePacket = new EspCommandPacket();
          responsePacket.parseResponse(value);

          if (
            responsePacket.direction === EspPacketDirection.RESPONSE &&
            responsePacket.command === expectedCommand
          ) {
            if (responsePacket.error > 0) {
              throw new Error(
                `Device returned error for ${
                  EspCommand[expectedCommand]
                }: ${responsePacket.getErrorMessage(responsePacket.error)}`,
              );
            }
            return responsePacket;
          }
        }
      }
    } finally {
      if (responseReader) {
        responseReader.releaseLock();
      }
    }
  }

  public async flashPartition(partition: Partition) {
    console.log(
      `Flashing partition: ${partition.filename}, offset: ${toHex(
        new Uint8Array(new Uint32Array([partition.offset]).buffer),
      )}`,
    );
    const packetSize = 4096;
    const numPackets = Math.ceil(partition.binary.length / packetSize);

    const flashBeginCmd = new EspCommandFlashBegin(
      partition.binary,
      partition.offset,
      packetSize,
      numPackets,
    );
    await this.writeToConnection(
      flashBeginCmd.getSlipStreamEncodedPacketData(),
    );
    await this.readResponse(EspCommand.FLASH_BEGIN);
    console.log("FLASH_BEGIN successful.");

    for (let i = 0; i < numPackets; i++) {
      const flashDataCmd = new EspCommandFlashData(
        partition.binary,
        i,
        packetSize,
      );
      await this.writeToConnection(
        flashDataCmd.getSlipStreamEncodedPacketData(),
      );
      console.log(
        `[${partition.filename}] Writing block ${i + 1}/${numPackets}`,
      );
      await this.readResponse(EspCommand.FLASH_DATA, 5000);
    }
    console.log(`Flash data for ${partition.filename} sent successfully.`);
  }

  public async flashImage(image: ESPImage) {
    if (!this.connection.connected) {
      throw new Error("Device is not connected.");
    }

    if (!this.connection.synced) {
      const synced = await this.sync();
      if (!synced) {
        throw new Error(
          "ESP32 Needs to Sync before flashing. Hold the `boot` button on the device during sync attempts.",
        );
      }
    }

    const attachCmd = new EspCommandSpiAttach();
    await this.writeToConnection(attachCmd.getSlipStreamEncodedPacketData());
    await this.readResponse(EspCommand.SPI_ATTACH);
    console.log("SPI_ATTACH successful.");

    const setParamsCmd = new EspCommandSpiSetParams();
    await this.writeToConnection(setParamsCmd.getSlipStreamEncodedPacketData());
    await this.readResponse(EspCommand.SPI_SET_PARAMS);
    console.log("SPI_SET_PARAMS successful.");

    for (const partition of image.partitions) {
      await this.flashPartition(partition);
    }

    console.log("Flashing complete. Resetting device...");
    await this.sendResetPulse();
    console.log("Device has been reset.");
  }
}
