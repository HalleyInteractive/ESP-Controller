import {
  createLineBreakTransformer,
  SlipStreamEncoder,
  SlipStreamDecoder,
} from "./stream-transformers";
import { sleep } from "../utils/common";
import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "../esp/esp.command";

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
}

/**
 * Creates an empty SerialConnection object with default initial values.
 * @returns A new SerialConnection object with its properties initialized.
 */
export function createSerialConnection() {
  return {
    port: undefined,
    connected: false,
    synced: false,
    readable: null,
    writable: null,
    abortStreamController: undefined,
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
 * Attaches a SLIP (Serial Line Internet Protocol) encoder to the `connection.writable` stream.
 * This function modifies the `connection.writable` property to use the SLIP encoder,
 * allowing outgoing data to be automatically encoded in the SLIP format.
 * @param connection The SerialConnection object whose writable stream will be wrapped with a SLIP encoder.
 */
export function attachSlipstreamEncoder(connection: SerialConnection): void {
  if (!connection.writable || !connection.abortStreamController) {
    return;
  }
  const streamPipeOptions = {
    signal: connection.abortStreamController.signal,
    preventCancel: false,
    preventClose: false,
    preventAbort: false,
  };
  const encoder = new SlipStreamEncoder();
  encoder.readable.pipeTo(connection.port.writable, streamPipeOptions);

  connection.writable = encoder.writable;
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
 * Creates a command stream reader by teeing the `connection.readable` stream.
 * The original `connection.readable` is replaced with one of the new streams.
 * The returned async generator yields `Uint8Array`s, where each array represents
 * a decoded SLIP (Serial Line Internet Protocol) packet received from the serial port.
 * @param connection The SerialConnection object.
 * @returns An async generator function that yields Uint8Array objects representing decoded SLIP packets.
 */
export function createCommandStreamReader(
  connection: SerialConnection,
): () => AsyncGenerator<Uint8Array<ArrayBufferLike>, void, unknown> {
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

  const [newReadable, commandReadable] = connection.readable.tee();
  connection.readable = newReadable;

  const reader = commandReadable
    .pipeThrough(new SlipStreamDecoder(), streamPipeOptions)
    .getReader();

  return async function* commandStream() {
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
  connection.connected = true;
  connection.readable = connection.port.readable;
  connection.writable = connection.port.writable;
  connection.abortStreamController = new AbortController();
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
  await sleep(50);
}

/**
 * Asynchronously writes a Uint8Array to the serial connection's writable stream.
 * Attaches a SLIP encoder if one is not already present and the port is available.
 */
export async function writeToConnection(
  connection: SerialConnection,
  data: Uint8Array,
) {
  if (!connection.writable && connection.port) {
    attachSlipstreamEncoder(connection);
  }
  if (!connection.writable) {
    return;
  }
  const writer = connection.writable.getWriter();
  await writer.write(data);
  writer.releaseLock();
}

export async function syncEsp(connection: SerialConnection): Promise<boolean> {
  await sendResetPulse(connection);
  const maxAttempts = 10;

  const syncCommand = new EspCommandPacket();
  syncCommand.command = EspCommand.SYNC;
  syncCommand.direction = EspPacketDirection.REQUEST;
  syncCommand.data = new Uint8Array([
    0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
  ]);
  syncCommand.checksum = 0;

  for (let i = 0; i < maxAttempts; i++) {
    await writeToConnection(connection, syncCommand.getPacketData());

    const responseReader = createCommandStreamReader(connection)();
    let response;
    for (let x = 0; x < 10; x++) {
      response = await Promise.race([responseReader.next(), sleep(100)]);
      console.log("RESPONSE", response);
    }

    const responsePacket = new EspCommandPacket();
    if (response?.value) {
      responsePacket.parseResponse(response.value);
      if (responsePacket.command === EspCommand.SYNC) {
        console.log("SYNCED", response);
        return true;
      }
    }
    console.log(`Sync attempt ${i + 1} of ${maxAttempts}`);
    await sleep(500);
    continue;
  }
  return false;
}
