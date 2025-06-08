import { describe, it, expect, vi } from "vitest";
import {
  createLoggingTransformer,
  createUint8LoggingTransformer,
  createLineBreakTransformer,
  SlipStreamEncoder,
  SlipStreamDecoder,
} from "./stream-transformers";

// Helper function to read everything from a stream until it's closed
async function readAllChunks(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  return chunks;
}

describe("LoggingTransformer", () => {
  it("should log and pass through string chunks", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const transformer = createLoggingTransformer();
    const reader = transformer.readable.getReader();
    const writer = transformer.writable.getWriter();
    const testChunk = "hello world";

    // 1. Start reading and get the promise for the result
    const readPromise = reader.read();

    // 2. Write to the stream and close it
    await writer.write(testChunk);
    await writer.close();

    // 3. Now await the result from the read promise
    const { value } = await readPromise;

    expect(consoleSpy).toHaveBeenCalledWith("STREAM LOG: ", testChunk);
    expect(value).toEqual(testChunk);

    consoleSpy.mockRestore();
  });
});

describe("Uint8LoggingTransformer", () => {
  it("should log and pass through Uint8Array chunks", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const transformer = createUint8LoggingTransformer();
    const reader = transformer.readable.getReader();
    const writer = transformer.writable.getWriter();
    const testChunk = new Uint8Array([1, 2, 3]);

    // 1. Start reading and get the promise for the result
    const readPromise = reader.read();

    // 2. Write to the stream and close it
    await writer.write(testChunk);
    await writer.close();

    // 3. Now await the result from the read promise
    const { value } = await readPromise;

    expect(consoleSpy).toHaveBeenCalledWith("UINT8 STREAM LOG: ", testChunk);
    expect(value).toEqual(testChunk);

    consoleSpy.mockRestore();
  });
});

describe("LineBreakTransformer", () => {
  it("should buffer and transform chunks into lines", async () => {
    const transformer = createLineBreakTransformer();
    const reader = transformer.readable.getReader();
    const writer = transformer.writable.getWriter();

    writer.write("first line\r\nsecond");
    let result = await reader.read();
    expect(result.value).toBe("first line");

    writer.write(" line\r\nthird line");
    result = await reader.read();
    expect(result.value).toBe("second line");

    writer.close();
    result = await reader.read();
    expect(result.done).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it("should handle multiple lines in a single chunk", async () => {
    const transformer = createLineBreakTransformer();
    const reader = transformer.readable.getReader();
    const writer = transformer.writable.getWriter();

    writer.write("line one\r\nline two\r\nline three\r\n");
    const results = [];
    results.push((await reader.read()).value);
    results.push((await reader.read()).value);
    results.push((await reader.read()).value);

    expect(results).toEqual(["line one", "line two", "line three"]);
  });

  it("should handle an empty stream", async () => {
    const transformer = createLineBreakTransformer();
    const reader = transformer.readable.getReader();
    const writer = transformer.writable.getWriter();

    await writer.close();
    const { done, value } = await reader.read();

    expect(done).toBe(true);
    expect(value).toBeUndefined();
  });
});

describe("SlipStreamEncoder", () => {
  it("should encode a simple chunk with start and end markers", async () => {
    const encoder = new SlipStreamEncoder();
    const writer = encoder.writable.getWriter();
    const reader = encoder.readable.getReader();

    const testChunk = new Uint8Array([1, 2, 3, 4]);
    // Expected: END, 1, 2, 3, 4, END
    const expected = new Uint8Array([0xc0, 1, 2, 3, 4, 0xc0]);

    const readPromise = reader.read();
    await writer.write(testChunk);
    await writer.close();

    const { value } = await readPromise;
    expect(value).toEqual(expected);
  });

  it("should escape END bytes within the chunk", async () => {
    const encoder = new SlipStreamEncoder();
    const writer = encoder.writable.getWriter();
    const reader = encoder.readable.getReader();

    const testChunk = new Uint8Array([0xc0, 1, 2, 0xc0]);
    // Expected: END, ESC, ESC_END, 1, 2, ESC, ESC_END, END
    const expected = new Uint8Array([0xc0, 0xdb, 0xdc, 1, 2, 0xdb, 0xdc, 0xc0]);

    const readPromise = reader.read();
    await writer.write(testChunk);
    await writer.close();

    const { value } = await readPromise;
    expect(value).toEqual(expected);
  });

  it("should escape ESC bytes within the chunk", async () => {
    const encoder = new SlipStreamEncoder();
    const writer = encoder.writable.getWriter();
    const reader = encoder.readable.getReader();

    const testChunk = new Uint8Array([0xdb, 1, 2, 0xdb]);
    // Expected: END, ESC, ESC_ESC, 1, 2, ESC, ESC_ESC, END
    const expected = new Uint8Array([0xc0, 0xdb, 0xdd, 1, 2, 0xdb, 0xdd, 0xc0]);

    const readPromise = reader.read();
    await writer.write(testChunk);
    await writer.close();

    const { value } = await readPromise;
    expect(value).toEqual(expected);
  });
});

describe("SlipStreamDecoder", () => {
  it("should decode a simple frame", async () => {
    const decoder = new SlipStreamDecoder();
    const writer = decoder.writable.getWriter();
    const reader = decoder.readable.getReader();

    const encodedChunk = new Uint8Array([0xc0, 1, 2, 3, 4, 0xc0]);
    const expected = new Uint8Array([1, 2, 3, 4]);

    const readPromise = reader.read();
    await writer.write(encodedChunk);

    const { value } = await readPromise;
    expect(value).toEqual(expected);
  });

  it("should decode a frame with escaped END and ESC bytes", async () => {
    const decoder = new SlipStreamDecoder();
    const writer = decoder.writable.getWriter();
    const reader = decoder.readable.getReader();
    // 1, END, 2, ESC, 3
    const originalData = new Uint8Array([1, 0xc0, 2, 0xdb, 3]);
    // END, 1, ESC, ESC_END, 2, ESC, ESC_ESC, 3, END
    const encodedChunk = new Uint8Array([
      0xc0, 1, 0xdb, 0xdc, 2, 0xdb, 0xdd, 3, 0xc0,
    ]);

    const readPromise = reader.read();
    await writer.write(encodedChunk);

    const { value } = await readPromise;
    expect(value).toEqual(originalData);
  });

  it("should decode multiple frames from a single chunk", async () => {
    const decoder = new SlipStreamDecoder();
    const writer = decoder.writable.getWriter();
    const reader = decoder.readable.getReader();

    // Frame 1: [1, 2], Frame 2: [3, 4]
    const encodedChunk = new Uint8Array([0xc0, 1, 2, 0xc0, 0xc0, 3, 4, 0xc0]);

    const chunksPromise = readAllChunks(reader);
    await writer.write(encodedChunk);
    await writer.close(); // Close the writer to end the stream

    const chunks = await chunksPromise;

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2]));
    expect(chunks[1]).toEqual(new Uint8Array([3, 4]));
  });

  it("should handle a frame split across multiple chunks", async () => {
    const decoder = new SlipStreamDecoder();
    const writer = decoder.writable.getWriter();
    const reader = decoder.readable.getReader();

    const part1 = new Uint8Array([0xc0, 1, 0xdb]);
    const part2 = new Uint8Array([0xdc, 2, 0xc0]);
    const expected = new Uint8Array([1, 0xc0, 2]);

    const readPromise = reader.read();
    await writer.write(part1);
    await writer.write(part2);

    const { value } = await readPromise;
    expect(value).toEqual(expected);
  });

  it("should ignore data before the first END byte", async () => {
    const decoder = new SlipStreamDecoder();
    const writer = decoder.writable.getWriter();
    const reader = decoder.readable.getReader();

    const encodedChunk = new Uint8Array([5, 6, 7, 0xc0, 1, 2, 3, 4, 0xc0]);
    const expected = new Uint8Array([1, 2, 3, 4]);

    const readPromise = reader.read();
    await writer.write(encodedChunk);

    const { value } = await readPromise;
    expect(value).toEqual(expected);
  });
});
