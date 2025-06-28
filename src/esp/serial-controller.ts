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
import { sleep, toHex, base64ToUint8Array } from "../utils/common";
import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";
import { ESPImage } from "../image/image";
import { Partition } from "../partition/partition";

// Import all necessary command classes
import { EspCommandSync } from "./command.sync";
import { EspCommandSpiAttach } from "./command.spi-attach";
import { EspCommandSpiSetParams } from "./command.spi-set-params";
import { EspCommandFlashBegin } from "./command.flash-begin";
import { EspCommandFlashData } from "./command.flash-data";
import { EspCommandReadReg } from "./command.read-reg";
import { EspCommandMemBegin } from "./command.mem-begin";
import { EspCommandMemData } from "./command.mem-data";
import { EspCommandMemEnd } from "./command.mem-end";

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
 * Known chip families and their magic values.
 */
export enum ChipFamily {
  ESP32 = 0x00f01d83,
  ESP32S2 = 0x000007c6,
  ESP32S3 = 0x9,
  ESP32C3 = 0x6921506f,
  ESP32C6 = 0x2ce0806f,
  ESP32H2 = 0xca02c06f,
  ESP8266 = 0xfff0c101,
  UNKNOWN = 0xffffffff,
}

/**
 * Interface representing the structure of a flasher stub JSON file.
 */
export interface Stub {
  entry: number;
  text_start: number;
  text: string; // Base64 encoded
  data_start: number;
  data: string; // Base64 encoded
}

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
  /** The detected chip family. Null if not yet detected. */
  chip: ChipFamily | null;
  /** The readable stream for receiving data from the serial port. Null if not connected. */
  readable: ReadableStream<Uint8Array> | null;
  /** The writable stream for sending data to the serial port. Null if not connected. */
  writable: WritableStream<Uint8Array> | null;
  /** An AbortController to signal termination of stream operations. Undefined if not connected. */
  abortStreamController: AbortController | undefined;
  /** A readable stream that contains the slipstream decoded responses from the esp. */
  commandResponseStream: ReadableStream<Uint8Array> | undefined;
}

export class SerialController extends EventTarget {
  public connection: SerialConnection;

  constructor() {
    super();
    this.connection = this.createSerialConnection();
  }

  private createSerialConnection(): SerialConnection {
    return {
      port: undefined,
      connected: false,
      synced: false,
      chip: null,
      readable: null,
      writable: null,
      abortStreamController: undefined,
      commandResponseStream: undefined,
    };
  }

  public async requestPort(): Promise<void> {
    this.connection.port = await navigator.serial.requestPort();
    this.connection.synced = false;
    this.connection.chip = null;
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
    if (!this.connection.port) return;
    await this.connection?.port.open(options);

    if (!this.connection.port?.readable) return;

    this.connection.abortStreamController = new AbortController();
    const [commandTee, logTee] = this.connection.port.readable.tee();

    this.connection.connected = true;
    this.connection.readable = logTee;
    this.connection.writable = this.connection.port.writable;
    this.connection.commandResponseStream = commandTee.pipeThrough(
      new SlipStreamDecoder(),
      { signal: this.connection.abortStreamController.signal },
    );
  }

  public async disconnect(): Promise<void> {
    if (!this.connection.connected || !this.connection.port) {
      return;
    }

    // Abort any ongoing stream operations
    this.connection.abortStreamController?.abort();

    try {
      await this.connection.port.close();
    } catch (error) {
      // The port might already be closed or disconnected by the device.
      console.error("Failed to close the serial port:", error);
    }

    // Reset the connection state, but keep the port reference
    const port = this.connection.port;
    this.connection = this.createSerialConnection();
    this.connection.port = port;
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
      this.dispatchEvent(
        new CustomEvent("sync-progress", {
          detail: { progress: (i / maxAttempts) * 100 },
        }),
      );
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
              this.dispatchEvent(
                new CustomEvent("sync-progress", {
                  detail: { progress: 100 },
                }),
              );
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

  public async detectChip(): Promise<ChipFamily> {
    if (!this.connection.synced) {
      throw new Error("Device must be synced to detect chip type.");
    }
    const CHIP_DETECT_MAGIC_REG_ADDR = 0x40001000;
    const readRegCmd = new EspCommandReadReg(CHIP_DETECT_MAGIC_REG_ADDR);
    await this.writeToConnection(readRegCmd.getSlipStreamEncodedPacketData());
    const response = await this.readResponse(EspCommand.READ_REG);

    const magicValue = response.value;

    const numericChipValues = Object.values(ChipFamily).filter(
      (v) => typeof v === "number",
    ) as ChipFamily[];

    const chip =
      numericChipValues.find((c) => c === magicValue) || ChipFamily.UNKNOWN;

    this.connection.chip = chip;
    console.log(
      `Detected chip: ${ChipFamily[chip]} (Magic value: ${toHex(new Uint8Array(new Uint32Array([magicValue]).buffer))})`,
    );

    if (chip === ChipFamily.UNKNOWN) {
      throw new Error("Could not detect a supported chip family.");
    }
    return chip;
  }

  public async loadToRam(
    binary: Uint8Array,
    offset: number,
    execute = false,
    entryPoint = 0,
  ) {
    console.log(
      `Loading binary to RAM at offset ${toHex(new Uint8Array(new Uint32Array([offset]).buffer))}`,
    );
    const packetSize = 1460;
    const numPackets = Math.ceil(binary.length / packetSize);

    const memBeginCmd = new EspCommandMemBegin(
      binary.length,
      numPackets,
      packetSize,
      offset,
    );
    await this.writeToConnection(memBeginCmd.getSlipStreamEncodedPacketData());
    await this.readResponse(EspCommand.MEM_BEGIN);

    for (let i = 0; i < numPackets; i++) {
      const memDataCmd = new EspCommandMemData(binary, i, packetSize);
      await this.writeToConnection(memDataCmd.getSlipStreamEncodedPacketData());
      await this.readResponse(EspCommand.MEM_DATA, 1000);
    }

    if (execute) {
      console.log(`Executing from entry point ${entryPoint}`);
      const memEndCmd = new EspCommandMemEnd(1, entryPoint);
      await this.writeToConnection(memEndCmd.getSlipStreamEncodedPacketData());
      await this.readResponse(EspCommand.MEM_END);
    }
  }

  /**
   * Fetches the stub for the given chip family from the local file system.
   * @param chip The chip family to fetch the stub for.
   * @returns A promise that resolves to the Stub object.
   */
  private async getStubForChip(chip: ChipFamily): Promise<Stub> {
    const chipNameMap: { [key in ChipFamily]?: string } = {
      [ChipFamily.ESP32]: "32",
      [ChipFamily.ESP32S2]: "32s2",
      [ChipFamily.ESP32S3]: "32s3",
      [ChipFamily.ESP32C3]: "32c3",
      [ChipFamily.ESP32C6]: "32c6",
      [ChipFamily.ESP32H2]: "32h2",
      [ChipFamily.ESP8266]: "8266",
    };

    const chipName = chipNameMap[chip];
    if (!chipName) {
      throw new Error(`No stub file mapping for chip: ${ChipFamily[chip]}`);
    }

    const stubUrl = `./stub-flasher/stub_flasher_${chipName}.json`;
    console.log(`Fetching stub from ${stubUrl}`);

    try {
      const response = await fetch(stubUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch stub file: ${response.statusText}`);
      }
      return await response.json();
    } catch (e) {
      console.error(`Error loading stub for ${ChipFamily[chip]}:`, e);
      throw e;
    }
  }

  private async uploadStub(stub: Stub): Promise<void> {
    const text = base64ToUint8Array(stub.text);
    const data = base64ToUint8Array(stub.data);

    await this.loadToRam(text, stub.text_start, false);
    await this.loadToRam(data, stub.data_start, false);

    console.log(`Starting stub at entry point 0x${stub.entry.toString(16)}...`);
    const memEndCmd = new EspCommandMemEnd(1, stub.entry);
    await this.writeToConnection(memEndCmd.getSlipStreamEncodedPacketData());

    await this.readResponse(EspCommand.MEM_END);
    console.log("Stub started successfully.");

    await this.awaitOhaiResponse();
  }

  private async awaitOhaiResponse(timeout = 2000): Promise<void> {
    let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    // The "OHAI" payload is 4 bytes: 0x4F, 0x48, 0x41, 0x49
    const ohaiPacket = new Uint8Array([0x4f, 0x48, 0x41, 0x49]);

    try {
      if (!this.connection.commandResponseStream) {
        throw new Error("No command response stream available.");
      }
      responseReader = this.connection.commandResponseStream.getReader();

      const timeoutPromise = sleep(timeout).then(() => {
        throw new Error(
          `Timeout: Did not receive "OHAI" from stub within ${timeout}ms.`,
        );
      });

      console.log("Waiting for 'OHAI' packet from stub...");

      while (true) {
        const { value, done } = await Promise.race([
          responseReader.read(),
          timeoutPromise,
        ]);

        if (done) {
          throw new Error(
            "Stream closed unexpectedly while waiting for 'OHAI'.",
          );
        }

        // Compare the received packet with the expected "OHAI" signature
        if (value && value.length === ohaiPacket.length) {
          if (value.every((byte, index) => byte === ohaiPacket[index])) {
            console.log("'OHAI' packet received, stub confirmed.");
            return; // Success
          }
        }
      }
    } finally {
      if (responseReader) {
        responseReader.releaseLock();
      }
    }
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

      this.dispatchEvent(
        new CustomEvent("flash-progress", {
          detail: {
            progress: ((i + 1) / numPackets) * 100,
            partition: partition,
          },
        }),
      );

      console.log(
        `[${partition.filename}] Writing block ${i + 1}/${numPackets}`,
      );
      await this.readResponse(EspCommand.FLASH_DATA, 5000);
    }
    console.log(`Flash data for ${partition.filename} sent successfully.`);
  }

  /**
   * Main method to flash a complete image.
   * @param image The ESPImage to flash.
   */
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

    if (!this.connection.chip) {
      await this.detectChip();
    }

    const stub = await this.getStubForChip(this.connection.chip!);
    await this.uploadStub(stub);

    const attachCmd = new EspCommandSpiAttach();
    await this.writeToConnection(attachCmd.getSlipStreamEncodedPacketData());
    await this.readResponse(EspCommand.SPI_ATTACH);
    console.log("SPI_ATTACH successful.");

    const setParamsCmd = new EspCommandSpiSetParams();
    await this.writeToConnection(setParamsCmd.getSlipStreamEncodedPacketData());
    await this.readResponse(EspCommand.SPI_SET_PARAMS);
    console.log("SPI_SET_PARAMS successful.");

    const totalSize = image.partitions.reduce(
      (acc, part) => acc + part.binary.length,
      0,
    );
    let flashedSize = 0;

    for (const partition of image.partitions) {
      const originalDispatchEvent = this.dispatchEvent;
      this.dispatchEvent = (event: Event) => {
        if (event.type === "flash-progress" && "detail" in event) {
          const partitionFlashed =
            (partition.binary.length * (event as CustomEvent).detail.progress) /
            100;
          originalDispatchEvent.call(
            this,
            new CustomEvent("flash-image-progress", {
              detail: {
                progress: ((flashedSize + partitionFlashed) / totalSize) * 100,
                partition: partition,
              },
            }),
          );
        }
        return originalDispatchEvent.call(this, event);
      };

      await this.flashPartition(partition);
      flashedSize += partition.binary.length;
      this.dispatchEvent = originalDispatchEvent;
    }

    this.dispatchEvent(
      new CustomEvent("flash-image-progress", {
        detail: { progress: 100 },
      }),
    );

    console.log("Flashing complete. Resetting device...");
    await this.sendResetPulse();
    console.log("Device has been reset.");
  }
}
