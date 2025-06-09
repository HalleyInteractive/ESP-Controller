import {
  createLineBreakTransformer,
  SlipStreamEncoder,
  SlipStreamDecoder,
} from "./stream-transformers";
import { sleep } from "../utils/common";

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
 * Serial connection interface.
 */
export interface SerialConnection {
  port: SerialPort | undefined;
  connected: boolean;
  synced: boolean;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  abortStreamController: AbortController | undefined;
}

/**
 * Creates an empty Serial Connection object.
 * @returns Empty state Serial Connection object.
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
 * Requests a new serial port from the navigator.
 * @param connection Serial Connection object to assign port to.
 * @returns The Serial Connection object.
 */
export async function requestPort(
  connection: SerialConnection,
): Promise<SerialConnection> {
  connection.port = await navigator.serial.requestPort();
  connection.synced = false;
  return connection;
}

/**
 * Attaches a slipstream encoder to the writable stream on the connection.
 * @param connection Serial connection to attach it to.
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
 * Tees the readable stream and returns a data stream with a text and linebreak transformer setup.
 * @param connection Serial connection to add the logStream to.
 * @returns async generator function yielding logs sent to the connection.
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
 * Tees the readable stream and returns a data stream with a slip stream transformer set up.
 * @param connection Serial connection to add the slipstream decoder to.
 * @returns async generator function yielding command responses sent to the connection.
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
 * Opens the port on a serial connection port.
 * @param connection SerialConnection object to open the port on.
 * @param options SerialOptions object, if not passed it will default to DEFAULT_ESP32_SERIAL_OPTIONS.
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
 * Send a reset pulse by setting dataTerminial false then true.
 * @param connection A serial connection with a connected port.
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
 * Write data to the connection.
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
