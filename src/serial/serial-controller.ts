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
 * Interface defining the properties of a serial connection.
 */
export interface ESPDeviceConnection {
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
 * Creates an empty ESPDeviceConnection object with default initial values.
 * @returns A new ESPDeviceConnection object with its properties initialized.
 */
export function createESPDeviceConnection() {
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
 * Prompts the user to select a serial port and assigns it to the provided deviceConnection object.
 * This function modifies the `deviceConnection.port` property and sets `deviceConnection.synced` to `false`.
 * @param deviceConnection The ESPDeviceConnection object to which the requested port will be assigned.
 * @returns A Promise that resolves with the modified ESPDeviceConnection object.
 */
export async function requestESPDevicePort(
  deviceConnection: ESPDeviceConnection,
): Promise<ESPDeviceConnection> {
  deviceConnection.port = await navigator.serial.requestPort();
  deviceConnection.synced = false;
  return deviceConnection;
}

/**
 * Attaches a SLIP (Serial Line Internet Protocol) encoder to the `deviceConnection.writable` stream.
 * This function modifies the `deviceConnection.writable` property to use the SLIP encoder,
 * allowing outgoing data to be automatically encoded in the SLIP format.
 * @param deviceConnection The ESPDeviceConnection object whose writable stream will be wrapped with a SLIP encoder.
 */
export function attachSLIPEncoder(deviceConnection: ESPDeviceConnection): void {
  if (!deviceConnection.writable || !deviceConnection.abortStreamController) {
    return;
  }
  const streamPipeOptions = {
    signal: deviceConnection.abortStreamController.signal,
    preventCancel: false,
    preventClose: false,
    preventAbort: false,
  };
  const encoder = new SlipStreamEncoder();
  encoder.readable.pipeTo(deviceConnection.port.writable, streamPipeOptions);

  deviceConnection.writable = encoder.writable;
}

/**
 * Creates a log stream reader by teeing the `deviceConnection.readable` stream.
 * The original `deviceConnection.readable` is replaced with one of the new streams.
 * The returned async generator yields strings, where each string is a line of text
 * received from the serial port, decoded as UTF-8, and split by line breaks.
 * @param deviceConnection The ESPDeviceConnection object.
 * @returns An async generator function that yields log strings from the deviceConnection.
 */
export function createDeviceLogStreamReader(
  deviceConnection: ESPDeviceConnection,
): () => AsyncGenerator<string | undefined, void, unknown> {
  if (
    !deviceConnection.connected ||
    !deviceConnection.readable ||
    !deviceConnection.abortStreamController
  )
    return async function* logStream() {};

  const streamPipeOptions = {
    signal: deviceConnection.abortStreamController.signal,
    preventCancel: false,
    preventClose: false,
    preventAbort: false,
  };

  const [newReadable, logReadable] = deviceConnection.readable.tee();
  deviceConnection.readable = newReadable;

  const reader = logReadable
    .pipeThrough(new TextDecoderStream(), streamPipeOptions)
    .pipeThrough(createLineBreakTransformer(), streamPipeOptions)
    .getReader();

  return async function* logStream() {
    try {
      while (deviceConnection.connected) {
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
 * Creates a command stream reader by teeing the `deviceConnection.readable` stream.
 * The original `deviceConnection.readable` is replaced with one of the new streams.
 * The returned async generator yields `Uint8Array`s, where each array represents
 * a decoded SLIP (Serial Line Internet Protocol) packet received from the serial port.
 * @param deviceConnection The ESPDeviceConnection object.
 * @returns An async generator function that yields Uint8Array objects representing decoded SLIP packets.
 */
export function createDeviceCommandStreamReader(
  deviceConnection: ESPDeviceConnection,
): () => AsyncGenerator<Uint8Array<ArrayBufferLike>, void, unknown> {
  if (
    !deviceConnection.connected ||
    !deviceConnection.readable ||
    !deviceConnection.abortStreamController
  )
    return async function* logStream() {};

  const streamPipeOptions = {
    signal: deviceConnection.abortStreamController.signal,
    preventCancel: false,
    preventClose: false,
    preventAbort: false,
  };

  const [newReadable, commandReadable] = deviceConnection.readable.tee();
  deviceConnection.readable = newReadable;

  const reader = commandReadable
    .pipeThrough(new SlipStreamDecoder(), streamPipeOptions)
    .getReader();

  return async function* commandStream() {
    try {
      while (deviceConnection.connected) {
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
 * Opens the serial port associated with the given ESPDeviceConnection object.
 * This function modifies the passed-in deviceConnection object by setting `connected` to true,
 * and initializing `readable`, `writable`, and `abortStreamController` properties
 * upon successful opening of the port. It also returns the modified deviceConnection object.
 * @param deviceConnection The ESPDeviceConnection object for which the port is to be opened.
 * @param options Optional SerialOptions to configure the port. Defaults to `DEFAULT_ESP32_SERIAL_OPTIONS`.
 * @returns A Promise that resolves with the modified ESPDeviceConnection object.
 */
export async function openESPDevicePort(
  deviceConnection: ESPDeviceConnection,
  options: SerialOptions = DEFAULT_ESP32_SERIAL_OPTIONS,
): Promise<ESPDeviceConnection> {
  if (!deviceConnection.port) return deviceConnection;
  await deviceConnection.port.open(options);
  deviceConnection.connected = true;
  deviceConnection.readable = deviceConnection.port.readable;
  deviceConnection.writable = deviceConnection.port.writable;
  deviceConnection.abortStreamController = new AbortController();
  return deviceConnection;
}

/**
 * Sends a reset pulse to the connected device by toggling the DTR (Data Terminal Ready)
 * and RTS (Request To Send) signals. This sequence is often used to put microcontrollers
 * like ESP32 into bootloader mode, allowing for firmware updates or other programming operations.
 * @param deviceConnection A ESPDeviceConnection object with an active and connected port.
 */
export async function sendESPDeviceResetPulse(
  deviceConnection: ESPDeviceConnection,
): Promise<void> {
  if (!deviceConnection.port) return;
  deviceConnection.port.setSignals({ dataTerminalReady: false, requestToSend: true });
  await sleep(100);
  deviceConnection.port.setSignals({ dataTerminalReady: true, requestToSend: false });
  await sleep(50);
}

/**
 * Asynchronously writes a Uint8Array to the serial deviceConnection's writable stream.
 * Attaches a SLIP encoder if one is not already present and the port is available.
 */
export async function writeToESPDevice(
  deviceConnection: ESPDeviceConnection,
  data: Uint8Array,
) {
  if (!deviceConnection.writable && deviceConnection.port) {
    attachSLIPEncoder(deviceConnection);
  }
  if (!deviceConnection.writable) {
    return;
  }
  const writer = deviceConnection.writable.getWriter();
  await writer.write(data);
  writer.releaseLock();
}
