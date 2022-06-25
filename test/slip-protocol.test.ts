/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
