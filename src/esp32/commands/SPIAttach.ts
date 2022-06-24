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
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from './ESP32CommandPacket';

export class SPIAttachCommand extends ESP32DataPacket {
  private spiAttachData = new ArrayBuffer(8);
  private view1 = new DataView(this.spiAttachData, 0, 4);
  private view2 = new DataView(this.spiAttachData, 4, 4);

  constructor() {
    super();
    this.direction = ESP32DataPacketDirection.REQUEST;
    this.command = ESP32Command.SPI_ATTACH;

    this.view1.setUint32(0, 0, true);
    this.view2.setUint32(0, 0, true);
    this.data = new Uint8Array(this.spiAttachData);
  }
}
