import {
  SlipStreamTransformer,
  SlipStreamTransformDirection,
} from '../src/serial/slip-protocol';
import {TransformStream} from 'node:stream/web';

describe('SlipStreamEncoder with starting END byte', () => {
  it('encode a basic message', async () => {
    const stream = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Encoding, true)
    );
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array([0x01, 0xdb, 0x49, 0xc0, 0x15]));
    writer.close();
    const reader = stream.readable.getReader();
    const buffer = new Uint8Array(await readStream(reader));
    expect(buffer).toEqual(
      new Uint8Array([0xc0, 0x01, 0xdb, 0xdd, 0x49, 0xdb, 0xdc, 0x15, 0xc0])
    );
  });

  it('decode a basic message', async () => {
    const stream = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, true)
    );
    const writer = stream.writable.getWriter();
    writer.write(
      new Uint8Array([0xc0, 0x01, 0xdb, 0xdd, 0x49, 0xdb, 0xdc, 0x15, 0xc0])
    );
    writer.close();
    const reader = stream.readable.getReader();
    const buffer = new Uint8Array(await readStream(reader));
    expect(buffer).toEqual(new Uint8Array([0x01, 0xdb, 0x49, 0xc0, 0x15]));
  });
});

describe('SlipStreamDecoder without starting END byte', () => {
  it('encode a basic message', async () => {
    const stream = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Encoding, false)
    );
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array([0x01, 0xdb, 0x49, 0xc0, 0x15]));
    writer.close();
    const reader = stream.readable.getReader();
    const buffer = new Uint8Array(await readStream(reader));
    expect(buffer).toEqual(
      new Uint8Array([0x01, 0xdb, 0xdd, 0x49, 0xdb, 0xdc, 0x15, 0xc0])
    );
  });

  it('decode a basic message', async () => {
    const stream = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, false)
    );
    const writer = stream.writable.getWriter();
    writer.write(
      new Uint8Array([0x01, 0xdb, 0xdd, 0x49, 0xdb, 0xdc, 0x15, 0xc0])
    );
    writer.close();
    const reader = stream.readable.getReader();
    const buffer = new Uint8Array(await readStream(reader));
    expect(buffer).toEqual(new Uint8Array([0x01, 0xdb, 0x49, 0xc0, 0x15]));
  });
});

describe('SlipStreamDecoder', () => {
  it('decode a split message', async () => {
    const stream = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, true)
    );
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array([0x00, 0x00, 0xc0, 0x01, 0xdb, 0xdd]));
    writer.write(new Uint8Array([0x49, 0xdb, 0xdc, 0x15, 0xc0, 0x00]));
    writer.close();
    const reader = stream.readable.getReader();
    const buffer = new Uint8Array(await readStream(reader));
    expect(buffer).toEqual(new Uint8Array([0x01, 0xdb, 0x49, 0xc0, 0x15]));
  });

  it('decode a message with padding', async () => {
    const stream = new TransformStream(
      new SlipStreamTransformer(SlipStreamTransformDirection.Decoding, true)
    );
    const writer = stream.writable.getWriter();
    writer.write(
      new Uint8Array([
        0x11, 0x22, 0x33, 0x44, 0xc0, 0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xc0, 0x11,
        0x22, 0x33, 0x44,
      ])
    );

    writer.close();
    const reader = stream.readable.getReader();
    const buffer = new Uint8Array(await readStream(reader));
    expect(buffer).toEqual(new Uint8Array([0x00, 0xaa, 0xbb, 0xcc, 0xdd]));
  });
});

async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: number[] = []
): Promise<number[]> {
  const packet = await reader.read();
  if (packet.value) {
    buffer.push(...packet.value);
  }
  if (!packet.done) {
    buffer.push(...(await readStream(reader)));
  }
  return buffer;
}
