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

import {FlashDataCommand} from './esp32/commands/FlashData';
import {SPIAttachCommand} from './esp32/commands/SPIAttach';
import {FlashBeginCommand} from './esp32/commands/FlashBegin';
import {SPISetParamsCommand} from './esp32/commands/SPISetParams';
import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from './esp32/commands/ESP32CommandPacket';
import {PortController} from './serial/port-controller';
import {sleep} from './utils/common';
import {ReadRegCommand} from './esp32/commands/ReadReg';
import {ESPImage} from './esp32/esp32-image';

enum ChipFamily {
  UNKNOWN = 0,
  ESP8266 = 1,
  ESP32 = 2,
  ESP32S2 = 3,
}
export class ESP32Controller {
  private controller: PortController | undefined;
  private port: SerialPort | undefined;
  private synced = false;
  private chipFamily: ChipFamily = 0;

  serialPrintEventListeners: Set<Function> = new Set();
  commandEventListeners: Set<Function> = new Set();

  constructor() {}

  async init() {
    this.port = await navigator.serial.requestPort();
    if (this.port) {
      this.synced = false;
      this.controller = new PortController(this.port);
      await this.controller.connect();
      this.logStreamReader();
      this.commandStreamReader();
      this.serialPrintEventListeners.add((log: string | undefined) => {
        console.log(log);
      });
    }
  }

  async logStreamReader() {
    if (this?.controller?.connected) {
      for await (const log of this.controller?.logStream()) {
        for (const listener of this.serialPrintEventListeners) {
          listener(log);
        }
      }
    }
  }

  async commandStreamReader() {
    if (this?.controller?.connected) {
      for await (const command of this.controller?.commandStream()) {
        for (const listener of this.commandEventListeners) {
          listener(command);
        }
      }
    }
  }

  async stop() {
    try {
      await this.controller?.disconnect();
    } catch (e) {
      console.log('Diconnect error');
      console.log(e);
    }
    if (!this.controller?.connected) {
      this.port = undefined;
    }
    this.synced = false;
  }

  async sync() {
    await this.reset();
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      const syncCommand = new ESP32DataPacket();
      syncCommand.command = ESP32Command.SYNC;
      syncCommand.direction = ESP32DataPacketDirection.REQUEST;
      syncCommand.data = new Uint8Array([
        0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
        0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
        0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
      ]);
      syncCommand.checksum = 0;
      await this.controller?.write(syncCommand.getPacketData());

      try {
        const response = await this.readResponse(ESP32Command.SYNC, 100);
        console.log('SYNCED', response);
        this.synced = true;
        break;
      } catch (e) {
        console.log(`Sync attempt ${i + 1} of ${maxAttempts}`);
        await sleep(500);
        continue;
      }
    }
  }

  async readChipFamily() {
    const readRegCommand = new ReadRegCommand(0x60000078);
    await this.controller?.write(readRegCommand.getPacketData());
    const response = await this.readResponse(ESP32Command.READ_REG);

    if (response?.command === ESP32Command.READ_REG) {
      switch (response.value) {
        case 0x15122500:
          this.chipFamily = ChipFamily.ESP32;
          console.log('CHIP FAMILY: ESP32');
          break;
        case 0x500:
          this.chipFamily = ChipFamily.ESP32S2;
          console.log('CHIP FAMILY: ESP32S2');
          break;
        case 0x00062000:
          this.chipFamily = ChipFamily.ESP8266;
          console.log('CHIP FAMILY: ESP8266');
          break;
        default:
          this.chipFamily = ChipFamily.UNKNOWN;
          break;
      }
    }

    const baseAddress = [0, 0x3ff00050, 0x6001a000, 0x6001a000][
      this.chipFamily
    ];
    for (let i = 0; i < 4; i++) {
      const readRegCommand = new ReadRegCommand(baseAddress + 4 * i);
      await this.controller?.write(readRegCommand.getPacketData());
      const response = await this.readResponse(ESP32Command.READ_REG);
      console.log(`eFuse ${i}`, response);
    }
  }

  async flashImage(image: ESPImage) {
    if (this.controller) {
      if (!this.synced) {
        await this.sync();
        if (!this.synced) {
          throw new Error(
            'ESP32 Needs to Sync before flashing a new image. Hold down the `boot` button on the ESP32 during sync attempts.'
          );
        }
      }
      console.log('Loading binary files');
      await image.load();

      const attachCommand = new SPIAttachCommand();
      await this.controller.write(attachCommand.getPacketData());
      await this.readResponse(ESP32Command.SPI_ATTACH);
      console.log('SPI ATTACH SENT');

      const apiParamCMD = new SPISetParamsCommand();
      await this.controller.write(apiParamCMD.getPacketData());
      await this.readResponse(ESP32Command.SPI_SET_PARAMS);
      console.log('SPI PARAMS SET');

      for (const partition of image.partitions) {
        await this.flashBinary(partition);
      }

      console.log('Flashing image done, resetting device...');
      await this.reset();
    }
  }

  async flashBinary(partition: Partition) {
    console.log(
      `Flashing partition: ${partition.filename}, offset: ${partition.offset}`
    );
    const packetSize = 512;
    const numPackets = Math.ceil(partition.binary.length / packetSize);

    const flashBeginCMD = new FlashBeginCommand(
      partition.binary,
      partition.offset,
      packetSize,
      numPackets
    );
    await this.controller?.write(flashBeginCMD.getPacketData());
    await this.readResponse(
      ESP32Command.FLASH_BEGIN,
      (30000 * numPackets * packetSize) / 1000000 + 500
    );
    console.log('FLASH BEGIN SENT');

    for (let i = 0; i < numPackets; i++) {
      const flashCommand = new FlashDataCommand(
        partition.binary,
        i,
        packetSize
      );
      await this.controller?.write(flashCommand.getPacketData());
      console.log(
        `[${partition.filename}] Writing block ${i + 1}/${numPackets}`
      );
      await this.readResponse(
        ESP32Command.FLASH_DATA,
        (30000 * numPackets * packetSize) / 1000000 + 500
      );
    }
  }

  private readResponse(
    cmd: ESP32Command,
    timeout: number = 2000
  ): Promise<ESP32DataPacket | null> {
    return new Promise((resolve, reject) => {
      const eventListener = (command: Uint8Array) => {
        const responsePacket = new ESP32DataPacket();
        try {
          responsePacket.parseResponse(command);
        } catch (error) {
          console.log('Incorrect packet response', error);
          return;
        }

        if (responsePacket.direction !== ESP32DataPacketDirection.RESPONSE) {
          console.log('Incorrect packet direction');
          return;
        }

        if (responsePacket.command !== cmd) {
          console.log('Incorrect response command');
          return;
        }
        this.commandEventListeners.delete(eventListener);
        resolve(responsePacket);
      };
      this.commandEventListeners.add(eventListener);
      sleep(timeout).then(() => {
        this.commandEventListeners.delete(eventListener);
        reject('timeout');
      });
    });
  }

  async reset() {
    this.synced = false;
    this.controller?.resetPulse();
  }

  get portConnected() {
    return this.controller?.connected;
  }

  get espSynced() {
    return this.synced;
  }
}
