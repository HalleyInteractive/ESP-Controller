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

import {
  PartitionDefinition,
  PartitionFlags,
  PartitionType,
} from "./partition-types";

const MAGIC_BYTES = new Uint8Array([0xaa, 0x50]);
const SIZEOF_STRUCT = 32;

export class PartitionEntry {
  name: string;
  type: PartitionType;
  subType: number;
  offset: number;
  size: number;
  flags: PartitionFlags;

  constructor(definition: PartitionDefinition) {
    if (definition.name.length > 16) {
      throw new Error("Partition name cannot be longer than 16 characters.");
    }
    this.name = definition.name;
    this.type = definition.type;
    this.subType = definition.subType;
    this.offset = definition.offset || 0;
    this.size = definition.size;
    this.flags = {
      encrypted: definition.flags?.encrypted || false,
      readonly: definition.flags?.readonly || false,
    };
  }

  public toBinary(): Uint8Array {
    const buffer = new ArrayBuffer(SIZEOF_STRUCT);
    const view = new DataView(buffer);
    const textEncoder = new TextEncoder();

    view.setUint8(0, MAGIC_BYTES[0]);
    view.setUint8(1, MAGIC_BYTES[1]);
    view.setUint8(2, this.type);
    view.setUint8(3, this.subType);
    view.setUint32(4, this.offset, true);
    view.setUint32(8, this.size, true);

    const encodedName = textEncoder.encode(this.name);
    new Uint8Array(buffer, 12, 16).set(encodedName);

    let flags = 0;
    if (this.flags.encrypted) {
      flags |= 1;
    }
    if (this.flags.readonly) {
      flags |= 2;
    }
    view.setUint32(28, flags, true);

    return new Uint8Array(buffer);
  }
}
