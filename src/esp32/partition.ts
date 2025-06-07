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
interface Partition {
  binary: Uint8Array;
  offset: number;
  filename: string;
  load(): Promise<boolean>;
}

export class BinFilePartion implements Partition {
  binary: Uint8Array = new Uint8Array(0);
  constructor(
    public readonly offset: number,
    public readonly filename: string
  ) {}

  async load(): Promise<boolean> {
    this.binary = new Uint8Array(
      await (await fetch(this.filename)).arrayBuffer()
    );
    return true;
  }
}
