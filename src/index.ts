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

import { FlashDataCommand } from "./esp32/commands/FlashData";
import { SPIAttachCommand } from "./esp32/commands/SPIAttach";
import { FlashBeginCommand } from "./esp32/commands/FlashBegin";
import { SPISetParamsCommand } from "./esp32/commands/SPISetParams";
import {
  ESP32Command,
  ESP32DataPacket,
  ESP32DataPacketDirection,
} from "./esp32/commands/ESP32CommandPacket";
// Partition is imported by ESPImage, so we don't need to import it here.
import { PortController } from "./serial/port-controller";
import { sleep } from "./utils/common";
import { ReadRegCommand } from "./esp32/commands/ReadReg";
import { ESPImage } from "./esp32/esp32-image";

enum ChipFamily {
  UNKNOWN = 0,
  ESP8266 = 1,
  ESP32 = 2,
  ESP32S2 = 3,
}

interface LogEventDetail {
  detail: string | undefined;
}

interface CommandEventDetail {
  detail: Uint8Array | undefined;
}

export function createESP32Controller() {
  let controller: PortController | undefined;
  let port: SerialPort | undefined;
  let synced = false;
  let chipFamily: ChipFamily = 0;
  const eventTarget = new EventTarget();

  async function init() {
    port = await navigator.serial.requestPort();
    if (port) {
      synced = false;
      controller = new PortController(port);
      await controller.connect();
      logStreamReader();
      commandStreamReader();
    }
  }

  async function logStreamReader() {
    if (controller?.connected) {
      for await (const log of controller.logStream()) {
        eventTarget.dispatchEvent(
          new CustomEvent<LogEventDetail["detail"]>("log", { detail: log }),
        );
      }
    }
  }

  async function commandStreamReader() {
    if (controller?.connected) {
      for await (const command of controller.commandStream()) {
        eventTarget.dispatchEvent(
          new CustomEvent<CommandEventDetail["detail"]>("command", {
            detail: command,
          }),
        );
      }
    }
  }

  async function stop() {
    try {
      await controller?.disconnect();
    } catch (e) {
      console.log("Diconnect error");
      console.log(e);
    }
    if (!controller?.connected) {
      port = undefined;
    }
    synced = false;
  }

  async function sync() {
    await reset();
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
      await controller?.write(syncCommand.getPacketData());

      try {
        const response = await readResponse(ESP32Command.SYNC, 100);
        console.log("SYNCED", response);
        synced = true;
        break;
      } catch (e) {
        console.log(`Sync attempt ${i + 1} of ${maxAttempts}: ${e}`);
        await sleep(500);
        continue;
      }
    }
  }

  async function readChipFamily() {
    const readRegCommand = new ReadRegCommand(0x60000078);
    await controller?.write(readRegCommand.getPacketData());
    const response = await readResponse(ESP32Command.READ_REG);

    if (response?.command === ESP32Command.READ_REG) {
      switch (response.value) {
        case 0x15122500:
          chipFamily = ChipFamily.ESP32;
          console.log("CHIP FAMILY: ESP32");
          break;
        case 0x500:
          chipFamily = ChipFamily.ESP32S2;
          console.log("CHIP FAMILY: ESP32S2");
          break;
        case 0x00062000:
          chipFamily = ChipFamily.ESP8266;
          console.log("CHIP FAMILY: ESP8266");
          break;
        default:
          chipFamily = ChipFamily.UNKNOWN;
          break;
      }
    }

    const baseAddress = [0, 0x3ff00050, 0x6001a000, 0x6001a000][chipFamily];
    for (let i = 0; i < 4; i++) {
      const readRegCommand = new ReadRegCommand(baseAddress + 4 * i);
      await controller?.write(readRegCommand.getPacketData());
      const response = await readResponse(ESP32Command.READ_REG);
      console.log(`eFuse ${i}`, response);
    }
  }

  async function flashImage(image: ESPImage) {
    if (controller) {
      if (!synced) {
        await sync();
        if (!synced) {
          throw new Error(
            "ESP32 Needs to Sync before flashing a new image. Hold down the `boot` button on the ESP32 during sync attempts.",
          );
        }
      }
      console.log("Loading binary files");
      await image.load();

      const attachCommand = new SPIAttachCommand();
      await controller.write(attachCommand.getPacketData());
      await readResponse(ESP32Command.SPI_ATTACH);
      console.log("SPI ATTACH SENT");

      const apiParamCMD = new SPISetParamsCommand();
      await controller.write(apiParamCMD.getPacketData());
      await readResponse(ESP32Command.SPI_SET_PARAMS);
      console.log("SPI PARAMS SET");

      for (const partition of image.partitions) {
        await flashBinary(partition);
      }

      console.log("Flashing image done, resetting device...");
      await reset();
    }
  }

  async function flashBinary(partition: Partition) {
    console.log(
      `Flashing partition: ${partition.filename}, offset: ${partition.offset}`,
    );
    const packetSize = 512;
    const numPackets = Math.ceil(partition.binary.length / packetSize);

    const flashBeginCMD = new FlashBeginCommand(
      partition.binary,
      partition.offset,
      packetSize,
      numPackets,
    );
    await controller?.write(flashBeginCMD.getPacketData());
    await readResponse(
      ESP32Command.FLASH_BEGIN,
      (30000 * numPackets * packetSize) / 1000000 + 500,
    );
    console.log("FLASH BEGIN SENT");

    for (let i = 0; i < numPackets; i++) {
      const flashCommand = new FlashDataCommand(
        partition.binary,
        i,
        packetSize,
      );
      await controller?.write(flashCommand.getPacketData());
      console.log(
        `[${partition.filename}] Writing block ${i + 1}/${numPackets}`,
      );
      await readResponse(
        ESP32Command.FLASH_DATA,
        (30000 * numPackets * packetSize) / 1000000 + 500,
      );
    }
  }

  function readResponse(
    cmd: ESP32Command,
    timeout: number = 2000,
  ): Promise<ESP32DataPacket | null> {
    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      const signal = abortController.signal;

      const eventListener = (event: Event) => {
        const customEvent = event as CustomEvent<CommandEventDetail["detail"]>;
        const command = customEvent.detail;
        if (!command) {
          // Should not happen with the current commandStreamReader implementation
          console.log("Received event with no command data");
          return;
        }
        const responsePacket = new ESP32DataPacket();
        try {
          responsePacket.parseResponse(command);
        } catch (error) {
          console.log("Incorrect packet response", error);
          return;
        }

        if (responsePacket.direction !== ESP32DataPacketDirection.RESPONSE) {
          console.log("Incorrect packet direction");
          return;
        }

        if (responsePacket.command !== cmd) {
          console.log("Incorrect response command");
          return;
        }
        abortController.abort(); // Clean up listener
        resolve(responsePacket);
      };

      eventTarget.addEventListener("command", eventListener, { signal });

      sleep(timeout).then(() => {
        if (!signal.aborted) {
          abortController.abort(); // Signal timeout
          reject("timeout");
        }
      });
    });
  }

  async function reset() {
    synced = false;
    controller?.resetPulse();
  }

  function getPortConnected() {
    return controller?.connected;
  }

  function getEspSynced() {
    return synced;
  }

  // EventTarget methods
  function addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    eventTarget.addEventListener(type, listener, options);
  }

  function removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    eventTarget.removeEventListener(type, listener, options);
  }

  function dispatchEvent(event: Event) {
    return eventTarget.dispatchEvent(event);
  }

  return {
    init,
    logStreamReader,
    commandStreamReader,
    stop,
    sync,
    readChipFamily,
    flashImage,
    flashBinary,
    reset,
    get portConnected() {
      return getPortConnected();
    },
    get espSynced() {
      return getEspSynced();
    },
    addEventListener,
    removeEventListener,
    dispatchEvent,
  };
}

// The ESP32Controller class has been refactored into the createESP32Controller factory function.
// The original class definition is removed, and createESP32Controller is exported.
