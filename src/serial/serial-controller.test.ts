import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createLogStreamReader,
  createSerialConnection,
  openPort,
  requestPort,
  sendResetPulse,
  type SerialConnection,
} from "./serial-controller";
import { sleep } from "../utils/common";

// Mock the sleep utility function
vi.mock("../utils/common", () => ({
  sleep: vi.fn(
    (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  ),
}));

// Create a high-quality mock for the Web Serial API's SerialPort
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
    writable: null,
    // Helper function to simulate the device sending data to the port
    _pushData: (data: Uint8Array) => {
      // Check if the stream is still active before pushing
      if (streamController.desiredSize) {
        streamController.enqueue(data);
      }
    },
    // Helper function to simulate the device closing the connection
    _closeStream: () => {
      // Check if the stream is still active before closing
      if (streamController.desiredSize) {
        streamController.close();
      }
    },
  };
};

// Define a type for our mock port to make it easier to work with in tests
type MockSerialPort = ReturnType<typeof createMockSerialPort>;

describe("Serial Utilities", () => {
  let mockPort: MockSerialPort;
  let connection: SerialConnection;

  beforeEach(() => {
    mockPort = createMockSerialPort();
    connection = {
      // Cast the mock to the actual SerialPort type for type safety in the functions being tested
      port: mockPort as unknown as SerialPort,
      connected: false,
      synced: false,
      readable: null,
      writable: null,
      abortStreamController: undefined,
      commandResponseStream: new ReadableStream(),
    };
  });

  afterEach(() => {
    // Clear all mocks after each test to ensure test isolation
    vi.clearAllMocks();
  });

  describe("createSerialConnection", () => {
    it("should return a new serial connection object with default values", () => {
      const newConnection = createSerialConnection();
      expect(newConnection).toEqual({
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
      // Mock the navigator object before each test in this suite
      vi.stubGlobal("navigator", {
        serial: {
          requestPort: vi.fn().mockResolvedValue(mockNewPort),
        },
      });
    });

    afterEach(() => {
      // Restore the original navigator object
      vi.unstubAllGlobals();
    });

    it("should request a port from the navigator and update the connection state", async () => {
      const conn = createSerialConnection();
      conn.synced = true; // Set to true to test that it gets reset by requestPort

      await requestPort(conn);

      expect(navigator.serial.requestPort).toHaveBeenCalledOnce();
      expect(conn.port).toBe(mockNewPort);
      expect(conn.synced).toBe(false);
    });
  });

  describe("openPort", () => {
    it("should open the port with default options and update connection state", async () => {
      await openPort(connection);

      expect(mockPort.open).toHaveBeenCalledTimes(1);
      // Check that the default options were used when none are provided
      expect(mockPort.open).toHaveBeenCalledWith(
        expect.objectContaining({
          baudRate: 115200,
          parity: "none",
        }),
      );
      expect(connection.connected).toBe(true);
    });

    it("should open the port with custom options", async () => {
      const customOptions: SerialOptions = { baudRate: 9600, dataBits: 7 };
      await openPort(connection, customOptions);

      expect(mockPort.open).toHaveBeenCalledWith(customOptions);
    });
  });

  describe("sendResetPulse", () => {
    beforeEach(() => {
      // Use fake timers to control sleep/setTimeout calls
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should send the correct sequence of signals with delays", async () => {
      const setSignalsSpy = vi.spyOn(mockPort, "setSignals");
      const resetPromise = sendResetPulse(connection);

      // Check initial signal state for reset
      expect(setSignalsSpy).toHaveBeenCalledWith({
        dataTerminalReady: false,
        requestToSend: true,
      });
      expect(sleep).toHaveBeenCalledWith(100);

      // Advance time past the first sleep interval
      await vi.advanceTimersByTimeAsync(100);

      // Check second signal state for reset
      expect(setSignalsSpy).toHaveBeenCalledWith({
        dataTerminalReady: true,
        requestToSend: false,
      });
      expect(sleep).toHaveBeenCalledWith(100);

      // Advance time past the second sleep interval
      await vi.advanceTimersByTimeAsync(100);

      // Ensure the sendResetPulse promise completes
      await resetPromise;

      expect(setSignalsSpy).toHaveBeenCalledTimes(2);
    });

    it("should do nothing if the port is not defined", async () => {
      connection.port = undefined;
      await sendResetPulse(connection);
      expect(mockPort.setSignals).not.toHaveBeenCalled();
    });
  });

  describe("createLogStreamReader", () => {
    const textEncoder = new TextEncoder();

    it("should return an empty async generator if not connected", async () => {
      connection.connected = false;
      const logStreamReader = createLogStreamReader(connection);
      const generator = logStreamReader();
      const result = await generator.next();

      expect(result.done).toBe(true);
    });

    it("should return an empty async generator if readable is null", async () => {
      connection.connected = true;
      connection.readable = null;
      const logStreamReader = createLogStreamReader(connection);
      const generator = logStreamReader();
      const result = await generator.next();

      expect(result.done).toBe(true);
    });

    it("should tee the readable stream and yield decoded lines", async () => {
      connection.connected = true;
      connection.readable = mockPort.readable;
      connection.abortStreamController = new AbortController();
      const originalReadable = connection.readable;

      const logStream = createLogStreamReader(connection)();

      // Verify the stream was teed and the connection's readable was updated
      expect(connection.readable).not.toBe(originalReadable);

      const receivedLines: (string | undefined)[] = [];

      // Concurrently consume the stream while producing data for it
      const consumerPromise = (async () => {
        for await (const line of logStream) {
          receivedLines.push(line);
        }
      })();

      const producerPromise = (async () => {
        await sleep(1); // Give consumer a moment to attach
        mockPort._pushData(textEncoder.encode("first line\r\n"));
        await sleep(1);
        mockPort._pushData(textEncoder.encode("second li"));
        await sleep(1);
        mockPort._pushData(textEncoder.encode("ne\r\n"));
        await sleep(1);
        mockPort._closeStream(); // Signal end of stream
      })();

      await Promise.all([consumerPromise, producerPromise]);

      expect(receivedLines).toEqual(["first line", "second line"]);
    });

    it("should stop yielding when connection.connected becomes false", async () => {
      connection.connected = true;
      connection.readable = mockPort.readable;
      connection.abortStreamController = new AbortController();
      const logStream = createLogStreamReader(connection)();

      const receivedLines: (string | undefined)[] = [];

      const consumerPromise = (async () => {
        for await (const line of logStream) {
          receivedLines.push(line);
          // Simulate a disconnect after receiving the first line
          if (receivedLines.length === 1) {
            connection.connected = false;
          }
        }
      })();

      const producerPromise = (async () => {
        // Give the consumer a moment to start and await a value
        await sleep(10);
        mockPort._pushData(textEncoder.encode("line one\r\n"));
        await sleep(10);
        // This line should not be read because the loop will have exited.
        // We do not close the stream, as the test is to ensure the `connected` flag stops the loop.
        mockPort._pushData(textEncoder.encode("line two\r\n"));
      })();

      await Promise.all([consumerPromise, producerPromise]);

      expect(receivedLines).toEqual(["line one"]);
    });

    it("should release the reader lock when the stream is fully consumed", async () => {
      connection.connected = true;
      connection.readable = mockPort.readable;
      const logStream = createLogStreamReader(connection)();

      const consumer = async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of logStream) {
          /* just consume to completion */
        }
      };

      const producer = async () => {
        mockPort._closeStream();
      };

      // Run consumer and producer in parallel
      await Promise.all([consumer(), producer()]);

      // To verify the lock is released, we check if we can get a new reader
      // from the other teed stream, which is now connection.readable.
      const reader2 = connection.readable?.getReader();
      expect(reader2).toBeDefined();

      // Since the original stream is closed, this should read as done.
      const result = await reader2?.read();
      expect(result?.done).toBe(true);

      // Clean up the new reader
      reader2?.releaseLock();
    });
  });
});
