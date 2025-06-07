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

import { BinFilePartion } from "./bin-file-partition";

export class ESPImage {
  partitions: Array<Partition> = [];

  constructor() {}

  addBootloader(fileName: string) {
    this.partitions.push(new BinFilePartion(0x1000, fileName));
  }

  addPartitionTable(fileName: string) {
    this.partitions.push(new BinFilePartion(0x8000, fileName));
  }

  addApp(fileName: string) {
    this.partitions.push(new BinFilePartion(0x10000, fileName));
  }

  addPartition(partition: Partition) {
    this.partitions.push(partition);
  }

  async load() {
    for (let i = 0; i < this.partitions.length; ++i) {
      await this.partitions[i].load();
    }
  }
}
