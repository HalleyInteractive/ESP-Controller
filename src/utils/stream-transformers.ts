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
export class LoggingTransformer implements Transformer<string, string> {
  constructor(public logPrefix: string = "STREAM LOG: ") {}
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>,
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

export class Uint8LoggingTransformer
  implements Transformer<Uint8Array, Uint8Array>
{
  constructor(public logPrefix: string = "UINT8 STREAM LOG: ") {}
  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

export class LineBreakTransformer implements Transformer<string, string> {
  buffer: string | undefined = "";
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>,
  ) {
    this.buffer += chunk;
    const lines = this.buffer?.split("\r\n");
    this.buffer = lines?.pop();
    lines?.forEach((line) => controller.enqueue(line));
  }
}
