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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SerialController } from "./serial-controller";
import { sleep } from "../utils/common";

vi.mock("../utils/common", () => ({
  sleep: vi.fn(
    (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  ),
  toHex: (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
}));

const createMockSerialPort = () => {
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  return {
    open: vi.fn().mockResolvedValue(undefined),
    setSignals: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    readable,
    writable: {
      getWriter: vi.fn(() => ({
        write: vi.fn().mockResolvedValue(undefined),
        releaseLock: vi.fn(),
      })),
    },
    _pushData: (data: Uint8Array) => {
      if (streamController.desiredSize) {
        streamController.enqueue(data);
      }
    },
    _closeStream: () => {
      if (streamController.desiredSize) {
        streamController.close();
      }
    },
  };
};

type MockSerialPort = ReturnType<typeof createMockSerialPort>;

describe("SerialController", () => {
  let mockPort: MockSerialPort;
  let serialController: SerialController;

  beforeEach(() => {
    mockPort = createMockSerialPort();
    serialController = new SerialController();
    serialController.connection.port = mockPort as unknown as SerialPort;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should return a new serial connection object with default values", () => {
      const newController = new SerialController();
      expect(newController.connection).toEqual({
        port: undefined,
        connected: false,
        synced: false,
        readable: null,
        writable: null,
        abortStreamController: undefined,
        commandResponseStream: undefined,
      });
    });
  });

  describe("requestPort", () => {
    const mockNewPort = createMockSerialPort();

    beforeEach(() => {
      vi.stubGlobal("navigator", {
        serial: {
          requestPort: vi.fn().mockResolvedValue(mockNewPort),
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should request a port from the navigator and update the connection state", async () => {
      serialController.connection.synced = true;

      await serialController.requestPort();

      expect(navigator.serial.requestPort).toHaveBeenCalledOnce();
      expect(serialController.connection.port).toBe(mockNewPort);
      expect(serialController.connection.synced).toBe(false);
    });
  });

  describe("openPort", () => {
    it("should open the port with default options and update connection state", async () => {
      await serialController.openPort();

      expect(mockPort.open).toHaveBeenCalledTimes(1);
      expect(mockPort.open).toHaveBeenCalledWith(
        expect.objectContaining({
          baudRate: 115200,
          parity: "none",
        }),
      );
      expect(serialController.connection.connected).toBe(true);
    });

    it("should open the port with custom options", async () => {
      const customOptions: SerialOptions = { baudRate: 9600, dataBits: 7 };
      await serialController.openPort(customOptions);

      expect(mockPort.open).toHaveBeenCalledWith(customOptions);
    });
  });

  describe("sendResetPulse", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should send the correct sequence of signals with delays", async () => {
      const setSignalsSpy = vi.spyOn(mockPort, "setSignals");
      const resetPromise = serialController.sendResetPulse();

      expect(setSignalsSpy).toHaveBeenCalledWith({
        dataTerminalReady: false,
        requestToSend: true,
      });
      expect(sleep).toHaveBeenCalledWith(100);

      await vi.advanceTimersByTimeAsync(100);

      expect(setSignalsSpy).toHaveBeenCalledWith({
        dataTerminalReady: true,
        requestToSend: false,
      });
      expect(sleep).toHaveBeenCalledWith(100);

      await vi.advanceTimersByTimeAsync(100);

      await resetPromise;

      expect(setSignalsSpy).toHaveBeenCalledTimes(2);
    });

    it("should do nothing if the port is not defined", async () => {
      serialController.connection.port = undefined;
      await serialController.sendResetPulse();
      expect(mockPort.setSignals).not.toHaveBeenCalled();
    });
  });

  describe("createLogStreamReader", () => {
    const textEncoder = new TextEncoder();

    it("should return an empty async generator if not connected", async () => {
      serialController.connection.connected = false;
      const logStreamReader = serialController.createLogStreamReader();
      const generator = logStreamReader();
      const result = await generator.next();

      expect(result.done).toBe(true);
    });

    it("should return an empty async generator if readable is null", async () => {
      serialController.connection.connected = true;
      serialController.connection.readable = null;
      const logStreamReader = serialController.createLogStreamReader();
      const generator = logStreamReader();
      const result = await generator.next();

      expect(result.done).toBe(true);
    });

    it("should tee the readable stream and yield decoded lines", async () => {
      serialController.connection.connected = true;
      serialController.connection.readable = mockPort.readable;
      serialController.connection.abortStreamController = new AbortController();
      const originalReadable = serialController.connection.readable;

      const logStream = serialController.createLogStreamReader()();

      expect(serialController.connection.readable).not.toBe(originalReadable);

      const receivedLines: (string | undefined)[] = [];

      const consumerPromise = (async () => {
        for await (const line of logStream) {
          receivedLines.push(line);
        }
      })();

      const producerPromise = (async () => {
        await sleep(1);
        mockPort._pushData(textEncoder.encode("first line\r\n"));
        await sleep(1);
        mockPort._pushData(textEncoder.encode("second li"));
        await sleep(1);
        mockPort._pushData(textEncoder.encode("ne\r\n"));
        await sleep(1);
        mockPort._closeStream();
      })();

      await Promise.all([consumerPromise, producerPromise]);

      expect(receivedLines).toEqual(["first line", "second line"]);
    });

    it("should stop yielding when connection.connected becomes false", async () => {
      serialController.connection.connected = true;
      serialController.connection.readable = mockPort.readable;
      serialController.connection.abortStreamController = new AbortController();
      const logStream = serialController.createLogStreamReader()();

      const receivedLines: (string | undefined)[] = [];

      const consumerPromise = (async () => {
        for await (const line of logStream) {
          receivedLines.push(line);
          if (receivedLines.length === 1) {
            serialController.connection.connected = false;
          }
        }
      })();

      const producerPromise = (async () => {
        await sleep(10);
        mockPort._pushData(textEncoder.encode("line one\r\n"));
        await sleep(10);
        mockPort._pushData(textEncoder.encode("line two\r\n"));
      })();

      await Promise.all([consumerPromise, producerPromise]);

      expect(receivedLines).toEqual(["line one"]);
    });

    it("should release the reader lock when the stream is fully consumed", async () => {
      serialController.connection.connected = true;
      serialController.connection.readable = mockPort.readable;
      serialController.connection.abortStreamController = new AbortController();
      const logStream = serialController.createLogStreamReader()();

      const consumer = async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of logStream) {
          /* just consume */
        }
      };

      const producer = async () => {
        mockPort._closeStream();
      };

      await Promise.all([consumer(), producer()]);

      const reader2 = serialController.connection.readable?.getReader();
      expect(reader2).toBeDefined();

      const result = await reader2?.read();
      expect(result?.done).toBe(true);

      reader2?.releaseLock();
    });
  });
});
