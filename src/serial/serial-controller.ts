import {
  createLineBreakTransformer,
  SlipStreamDecoder,
} from "./stream-transformers";
import { sleep, toHex } from "../utils/common";
import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "../esp/esp.command";
import { EspCommandSync } from "../esp/esp.command.sync";
import { EspCommandSpiAttach } from "../esp/esp.command.spi-attach";
import { EspCommandSpiSetParams } from "../esp/esp.command.spi-set-params";
import { ESPImage } from "../image/esp.image";
import { EspCommandFlashData } from "../esp/esp.command.flash-data";
import { EspCommandFlashBegin } from "../esp/esp.command.flash-begin";
import { Partition } from "../image/esp.partition";

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

/**
 * Creates an empty SerialConnection object with default initial values.
 * @returns A new SerialConnection object with its properties initialized.
 */
export function createSerialConnection(): SerialConnection {
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

/**
 * Prompts the user to select a serial port and assigns it to the provided connection object.
 * This function modifies the `connection.port` property and sets `connection.synced` to `false`.
 * @param connection The SerialConnection object to which the requested port will be assigned.
 * @returns A Promise that resolves with the modified SerialConnection object.
 */
export async function requestPort(
  connection: SerialConnection,
): Promise<SerialConnection> {
  connection.port = await navigator.serial.requestPort();
  connection.synced = false;
  return connection;
}

/**
 * Creates a log stream reader by teeing the `connection.readable` stream.
 * The original `connection.readable` is replaced with one of the new streams.
 * The returned async generator yields strings, where each string is a line of text
 * received from the serial port, decoded as UTF-8, and split by line breaks.
 * @param connection The SerialConnection object.
 * @returns An async generator function that yields log strings from the connection.
 */
export function createLogStreamReader(
  connection: SerialConnection,
): () => AsyncGenerator<string | undefined, void, unknown> {
  if (
    !connection.connected ||
    !connection.readable ||
    !connection.abortStreamController
  )
    return async function* logStream() {};

  const streamPipeOptions = {
    signal: connection.abortStreamController.signal,
    preventCancel: false,
    preventClose: false,
    preventAbort: false,
  };

  const [newReadable, logReadable] = connection.readable.tee();
  connection.readable = newReadable;

  const reader = logReadable
    .pipeThrough(new TextDecoderStream(), streamPipeOptions)
    .pipeThrough(createLineBreakTransformer(), streamPipeOptions)
    .getReader();

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

/**
 * Opens the serial port associated with the given SerialConnection object.
 * This function modifies the passed-in connection object by setting `connected` to true,
 * and initializing `readable`, `writable`, and `abortStreamController` properties
 * upon successful opening of the port. It also returns the modified connection object.
 * @param connection The SerialConnection object for which the port is to be opened.
 * @param options Optional SerialOptions to configure the port. Defaults to `DEFAULT_ESP32_SERIAL_OPTIONS`.
 * @returns A Promise that resolves with the modified SerialConnection object.
 */
export async function openPort(
  connection: SerialConnection,
  options: SerialOptions = DEFAULT_ESP32_SERIAL_OPTIONS,
): Promise<SerialConnection> {
  if (!connection.port) return connection;
  await connection.port.open(options);

  // Tee the main readable stream immediately and only once.
  const [commandTee, logTee] = connection.port.readable.tee();

  connection.connected = true;
  connection.readable = logTee;
  connection.writable = connection.port.writable;
  connection.abortStreamController = new AbortController();
  connection.commandResponseStream = commandTee.pipeThrough(
    new SlipStreamDecoder(),
  );

  return connection;
}

/**
 * Sends a reset pulse to the connected device by toggling the DTR (Data Terminal Ready)
 * and RTS (Request To Send) signals. This sequence is often used to put microcontrollers
 * like ESP32 into bootloader mode, allowing for firmware updates or other programming operations.
 * @param connection A SerialConnection object with an active and connected port.
 */
export async function sendResetPulse(
  connection: SerialConnection,
): Promise<void> {
  if (!connection.port) return;
  connection.port.setSignals({ dataTerminalReady: false, requestToSend: true });
  await sleep(100);
  connection.port.setSignals({ dataTerminalReady: true, requestToSend: false });
  await sleep(100);
}

/**
 * Asynchronously writes a Uint8Array to the serial connection's writable stream.
 * Attaches a SLIP encoder if one is not already present and the port is available.
 */
export async function writeToConnection(
  connection: SerialConnection,
  data: Uint8Array,
) {
  // Add trace log to see the exact bytes being sent
  // console.log(`TRACE Write: ${data.length} bytes: ${toHex(data)}`);

  if (connection.writable) {
    const writer = connection.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
  }
}

export async function syncEsp(connection: SerialConnection): Promise<boolean> {
  await sendResetPulse(connection);
  const maxAttempts = 10;
  const timeoutPerAttempt = 500; // ms

  const syncCommand = new EspCommandSync();

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Sync attempt ${i + 1} of ${maxAttempts}`);
    await writeToConnection(
      connection,
      syncCommand.getSlipStreamEncodedPacketData(),
    );

    let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      if (!connection.commandResponseStream) {
        throw new Error(`No command response stream available.`);
      }
      responseReader = connection.commandResponseStream.getReader();

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
            connection.synced = true;
            return true;
          }
        }
      }
    } catch (e) {
      console.log(`Sync attempt ${i + 1} timed out.`, e);
    } finally {
      // Ensure the reader lock is always released, even on timeout or success.
      if (responseReader) {
        responseReader.releaseLock();
      }
    }

    await sleep(100);
  }

  console.log("Failed to sync with the device.");
  connection.synced = false;
  return false;
}

/**
 * Reads a response from the command stream, waiting for a specific command type.
 * @param connection - The active serial connection.
 * @param expectedCommand - The command we are expecting a response for.
 * @param timeout - The maximum time to wait for a response in milliseconds.
 * @returns A promise that resolves with the parsed response packet.
 * @throws If a timeout occurs or an error response is received.
 */
async function readResponse(
  connection: SerialConnection,
  expectedCommand: EspCommand,
  timeout = 2000,
): Promise<EspCommandPacket> {
  let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!connection.commandResponseStream) {
      throw new Error(`No command response stream available.`);
    }
    responseReader = connection.commandResponseStream.getReader();
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
        throw new Error("Stream closed unexpectedly while awaiting response.");
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

/**
 * Flashes a single partition's binary data to the device.
 * @param connection - The active and synced serial connection.
 * @param partition - The partition to flash.
 */
export async function flashPartition(
  connection: SerialConnection,
  partition: Partition,
) {
  console.log(
    `Flashing partition: ${partition.filename}, offset: ${toHex(
      new Uint8Array(new Uint32Array([partition.offset]).buffer),
    )}`,
  );
  const packetSize = 4096; // Standard flash block size
  const numPackets = Math.ceil(partition.binary.length / packetSize);

  // 1. Send FLASH_BEGIN command
  const flashBeginCmd = new EspCommandFlashBegin(
    partition.binary,
    partition.offset,
    packetSize,
    numPackets,
  );
  await writeToConnection(
    connection,
    flashBeginCmd.getSlipStreamEncodedPacketData(),
  );
  await readResponse(connection, EspCommand.FLASH_BEGIN);
  console.log("FLASH_BEGIN successful.");

  // 2. Send all FLASH_DATA packets
  for (let i = 0; i < numPackets; i++) {
    const flashDataCmd = new EspCommandFlashData(
      partition.binary,
      i,
      packetSize,
    );
    await writeToConnection(
      connection,
      flashDataCmd.getSlipStreamEncodedPacketData(),
    );
    console.log(`[${partition.filename}] Writing block ${i + 1}/${numPackets}`);
    // Increase timeout for data flashing as it can be slow
    await readResponse(connection, EspCommand.FLASH_DATA, 5000);
  }
  console.log(`Flash data for ${partition.filename} sent successfully.`);
}

/**
 * Manages the entire process of flashing an image, including all its partitions.
 * @param connection - The active serial connection.
 * @param image - The ESPImage object containing all partitions to be flashed.
 * @throws If the device is not connected or fails to sync.
 */
export async function flashImage(
  connection: SerialConnection,
  image: ESPImage,
) {
  if (!connection.connected) {
    throw new Error("Device is not connected.");
  }

  // 1. Sync with the device
  if (!connection.synced) {
    const synced = await syncEsp(connection);
    if (!synced) {
      throw new Error(
        "ESP32 Needs to Sync before flashing. Hold the `boot` button on the device during sync attempts.",
      );
    }
  }

  // 2. Load all partition binaries from files
  console.log("Loading binary files...");
  await image.load();

  // 3. Send SPI_ATTACH command
  const attachCmd = new EspCommandSpiAttach();
  await writeToConnection(
    connection,
    attachCmd.getSlipStreamEncodedPacketData(),
  );
  await readResponse(connection, EspCommand.SPI_ATTACH);
  console.log("SPI_ATTACH successful.");

  // 4. Send SPI_SET_PARAMS command
  const setParamsCmd = new EspCommandSpiSetParams();
  await writeToConnection(
    connection,
    setParamsCmd.getSlipStreamEncodedPacketData(),
  );
  await readResponse(connection, EspCommand.SPI_SET_PARAMS);
  console.log("SPI_SET_PARAMS successful.");

  // 5. Flash each partition
  for (const partition of image.partitions) {
    await flashPartition(connection, partition);
  }

  // 6. Reset the device to run the new image
  console.log("Flashing complete. Resetting device...");
  await sendResetPulse(connection);
  console.log("Device has been reset.");
}
