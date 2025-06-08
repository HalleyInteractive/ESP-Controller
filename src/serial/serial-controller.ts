import { createLineBreakTransformer } from "./stream-transformers";
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
 * Tees the readable stream and returns a data stream with a text and linebreak transformer setup.
 * @param connection Serial connection to add the logStream to.
 * @returns async generator function yielding logs sent to the connection.
 */
export function createLogStreamReader(
  connection: SerialConnection,
): () => AsyncGenerator<string | undefined, void, unknown> {
  if (!connection.connected || !connection.readable)
    return async function* logStream() {};

  connection.abortStreamController = new AbortController();
  const streamPipeOptions = {
    signal: connection.abortStreamController.signal,
    preventCancel: false,
    preventClose: false,
    preventAbort: false,
  };

  const [newReadable, logReadable] = connection.readable.tee();
  connection.readable = newReadable;

  // 👇 THIS IS THE FIX 👇
  // Create NEW transformer instances here, inside the function.
  // Do NOT use global constants for streams that will be piped through.
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
