/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EspCommand, EspCommandPacket, EspPacketDirection } from "./command";

export class EspCommandFlashBegin extends EspCommandPacket {
  private flashBeginData = new ArrayBuffer(16);
  private eraseSizeView = new DataView(this.flashBeginData, 0, 4);
  private numDataPacketsView = new DataView(this.flashBeginData, 4, 4);
  private dataSizeView = new DataView(this.flashBeginData, 8, 4);
  private offsetView = new DataView(this.flashBeginData, 12, 4);

  constructor(
    image: Uint8Array,
    offset: number,
    packetSize: number,
    numPackets: number,
  ) {
    super();

    this.direction = EspPacketDirection.REQUEST;
    this.command = EspCommand.FLASH_BEGIN;
    this.eraseSizeView.setUint32(0, image.length, true);
    this.numDataPacketsView.setUint32(0, numPackets, true);
    this.dataSizeView.setUint32(0, packetSize, true);
    this.offsetView.setUint32(0, offset, true);
    this.data = new Uint8Array(this.flashBeginData);
  }
}
