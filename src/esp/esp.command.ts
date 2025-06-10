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

import { slipEncode } from "../utils/common";

export enum EspPacketDirection {
  REQUEST = 0x00,
  RESPONSE = 0x01,
}

export enum EspCommand {
  FLASH_BEGIN = 0x02,
  FLASH_DATA = 0x03,
  FLASH_END = 0x04,
  MEM_BEGIN = 0x05,
  MEM_END = 0x06,
  MEM_DATA = 0x07,
  SYNC = 0x08,
  WRITE_REG = 0x09,
  READ_REG = 0x0a,
  SPI_SET_PARAMS = 0x0b,
  SPI_ATTACH = 0x0d,
  CHANGE_BAUDRATE = 0x0f,
  FLASH_DEFL_BEGIN = 0x10,
  FLASH_DEFL_DATA = 0x11,
  FLASH_DEFL_END = 0x12,
  SPI_FLASH_MD5 = 0x13,
}

export class EspCommandPacket {
  private packetHeader: Uint8Array = new Uint8Array(8);
  private packetData: Uint8Array = new Uint8Array(0);

  set direction(direction: EspPacketDirection) {
    new DataView(this.packetHeader.buffer, 0, 1).setUint8(0, direction);
  }

  get direction(): EspPacketDirection {
    return new DataView(this.packetHeader.buffer, 0, 1).getUint8(0);
  }

  set command(command: EspCommand) {
    new DataView(this.packetHeader.buffer, 1, 1).setUint8(0, command);
  }

  get command(): EspCommand {
    return new DataView(this.packetHeader.buffer, 1, 1).getUint8(0);
  }

  set size(size: number) {
    new DataView(this.packetHeader.buffer, 2, 2).setUint16(0, size, true);
  }

  get size(): number {
    return new DataView(this.packetHeader.buffer, 2, 2).getUint16(0, true);
  }

  set checksum(checksum: number) {
    new DataView(this.packetHeader.buffer, 4, 4).setUint32(0, checksum, true);
  }

  get checksum(): number {
    return new DataView(this.packetHeader.buffer, 4, 4).getUint32(0, true);
  }

  set value(value: number) {
    new DataView(this.packetHeader.buffer, 4, 4).setUint32(0, value, true);
  }

  get value(): number {
    return new DataView(this.packetHeader.buffer, 4, 4).getUint32(0, true);
  }

  get status(): number {
    return new DataView(this.packetData.buffer, 0, 1).getUint8(0);
  }

  get error(): number {
    return new DataView(this.packetData.buffer, 1, 1).getUint8(0);
  }

  generateChecksum(data: Uint8Array): number {
    let cs = 0xef;
    for (const byte of data) {
      cs ^= byte;
    }
    return cs;
  }

  set data(packetData: Uint8Array) {
    this.size = packetData.length;
    this.packetData = packetData;
  }

  get data(): Uint8Array {
    return this.packetData;
  }

  parseResponse(responsePacket: Uint8Array) {
    const responseDataView = new DataView(responsePacket.buffer);
    this.direction = responseDataView.getUint8(0) as EspPacketDirection;
    this.command = responseDataView.getUint8(1) as EspCommand;
    this.size = responseDataView.getUint16(2, true);
    this.value = responseDataView.getUint32(4, true);
    this.packetData = responsePacket.slice(8);

    if (this.status === 1) {
      console.log(this.getErrorMessage(this.error));
    }
  }

  getErrorMessage(error: number): string {
    switch (error) {
      case 0x05:
        return "Status Error: Received message is invalid. (parameters or length field is invalid)";
      case 0x06:
        return "Failed to act on received message";
      case 0x07:
        return "Invalid CRC in message";
      case 0x08:
        return "flash write error - after writing a block of data to flash, the ROM loader reads the value back and the 8-bit CRC is compared to the data read from flash. If they don't match, this error is returned.";
      case 0x09:
        return "flash read error - SPI read failed";
      case 0x0a:
        return "flash read length error - SPI read request length is too long";
      case 0x0b:
        return "Deflate error (compressed uploads only)";
      default:
        return "No error status for response";
    }
  }

  getPacketData(): Uint8Array {
    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    view.setUint8(0, this.direction);
    view.setUint8(1, this.command);
    view.setUint16(2, this.data.length, true);
    view.setUint32(4, this.checksum, true);
    return new Uint8Array([...header, ...this.data]);
  }

  getSlipStreamEncodedPacketData(): Uint8Array {
    return slipEncode(this.getPacketData());
  }
}
