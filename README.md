# esp-controller

A TypeScript library for connecting to, controlling, and flashing ESP32 devices directly from the browser using the Web Serial API.

[![npm version](https://badge.fury.io/js/esp-controller.svg)](https://badge.fury.io/js/esp-controller)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/HalleyInteractive/esp-controller/actions/workflows/ci.yml/badge.svg)](https://github.com/HalleyInteractive/esp-controller/actions/workflows/ci.yml)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

## Features

- Cross-Platform: Works in any modern browser that supports the Web Serial API (e.g., Chrome, Edge, Opera).
- Easy to Use: A simple and intuitive API for connecting, flashing, and interacting with your ESP32.
- Dynamic Image Creation: Easily create and flash firmware images, including bootloader, partition tables, and application binaries.
- NVS Partition Generation: Dynamically create Non-Volatile Storage (NVS) partitions with your own key-value data.

## Getting Started

### Installation

To install the package, run the following command:

```bash
npm install esp-controller
```

### Basic Usage

```typescript
import {
  SerialController,
  ESPImage,
  NVSPartition,
  PartitionTable,
} from "esp-controller";

// 1. Initialize the Serial Controller
const serialController = new SerialController();

// 2. Create a firmware image
const image = new ESPImage();
image.addBootloader("binaries/bootloader.bin");
image.addApp("binaries/app.bin");

// 3. Create a partition table
const partitionTable = PartitionTable.singleFactoryAppNoOta();
image.addPartition(partitionTable);

// 4. Create an NVS partition with custom data
const nvsPartition = new NVSPartition(0x9000, "nvs.bin");
nvsPartition.writeEntry("my_namespace", "my_key", "my_value");
image.addPartition(nvsPartition);

// 5. Connect to the ESP32 and flash the image
async function connectAndFlash() {
  try {
    // Request the user to select a serial port
    await serialController.requestPort();

    // Open the port and connect
    await serialController.openPort();

    // Flash the image
    await serialController.flashImage(image);

    console.log("Flashing complete!");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

// Add a button to your HTML to trigger the connection
const connectButton = document.getElementById("connect-button");
connectButton.addEventListener("click", connectAndFlash);
```

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md)) file for guidelines.

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.
