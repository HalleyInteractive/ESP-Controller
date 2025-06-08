import { describe, it, expect, vi } from "vitest";
import {
  createLoggingTransformer,
  createUint8LoggingTransformer,
  createLineBreakTransformer,
} from "./stream-transformers"; // Assuming your file is named transformers.ts

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

// The successful tests for LineBreakTransformer remain the same
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
