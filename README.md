# **ESP-Controller**

A TypeScript library for interacting with and managing your Espressif devices. Programmatically generate and flash firmware, partition tables, and Non-Volatile Storage (NVS) binaries for ESP8266, ESP32, and other supported models.

This library is ideal for creating custom web-based or Node.js flashing and provisioning tools.

## **Features**

- **🔌 Web Serial Connection:** Connect to your ESP device directly from environments that support the Web Serial API (like Google Chrome or Microsoft Edge).
- **⚡️ Flash Firmware:** Easily flash firmware binaries to your ESP device.
- **📊 Programmatic Partition Table Generation:**
  - Define partition tables in TypeScript.
  - Generate partition_table.bin from your TypeScript definition.
  - Flash the generated partition table binary to the device.
- **💾 Programmatic NVS (Non-Volatile Storage) Generation:**
  - Define NVS namespaces and key-value pairs in TypeScript.
  - Generate an NVS partition binary from your definitions.
  - Flash the generated NVS binary to the device.
- **💻 Serial Monitor:** Includes a basic serial monitor to view logs and output from your ESP device.
- **📁 File System Management (Future Feature):** Support for managing files on SPIFFS or LittleFS is planned for a future release.

## **Supported Models**

This tool is designed to work with a variety of Espressif models. The following models have been tested and are confirmed to be working:

- ESP32
- ESP32-S2
- ESP32-S3
- ESP32-C3
- ESP8266

If you have successfully used this library with a model not listed here, please let us know by opening an issue\!

## **Getting Started**

To get started with esp-controller, you can install it as a dependency in your project.

npm install esp-controller

You can then import the necessary classes and functions into your TypeScript project to begin interacting with your ESP device.

import { SerialController } from 'esp-controller';

const connectButton \= document.getElementById('connect');  
const serialController \= new SerialController();

connectButton.onclick \= async () \=\> {  
 await serialController.connect();  
 console.log('Connected\!');  
 // You can now flash firmware, partitions, etc.  
};

## **Usage Examples**

### **Flashing a Pre-compiled Firmware**

1. Obtain your firmware binary file (.bin).
2. Use the flash method from the SerialController to write it to the device.

// Assuming 'serialController' is an instance of SerialController  
// and 'firmwareBinary' is an ArrayBuffer containing your firmware.  
const flashAddress \= 0x10000;

await serialController.flash(firmwareBinary, flashAddress, (progress) \=\> {  
 console.log(\`Flashing progress: ${progress}%\`);  
});

console.log('Flashed successfully\!');

### **Programmatically Generating and Flashing a Partition Table**

Instead of using a CSV file, you can define your partition table directly in code.

1. Define your partitions using PartitionEntry.
2. Create a PartitionTable instance.
3. Generate the binary using the toBinary() method.
4. Flash the resulting binary.

import { PartitionTable, PartitionEntry, PartitionType } from 'esp-controller/partition';

// 1\. Define partition entries  
const nvsEntry \= new PartitionEntry('nvs', PartitionType.DATA, 0, 0x9000, '20K');  
const otaDataEntry \= new PartitionEntry('otadata', PartitionType.DATA, 1, 0xe000, '8K');  
const app0Entry \= new PartitionEntry('app0', PartitionType.APP, 0, 0x10000, '1M');

// 2\. Create a partition table  
const partitionTable \= new PartitionTable(nvsEntry, otaDataEntry, app0Entry);

// 3\. Generate the binary  
const partitionTableBinary \= partitionTable.toBinary();

// 4\. Flash the binary to the device (usually at 0x8000)  
await serialController.flash(partitionTableBinary, 0x8000);

### **Programmatically Generating and Flashing NVS**

You can generate an NVS binary with your desired key-value pairs for device provisioning.

1. Create NVSEntry instances for each key-value pair.
2. Create an NVSPartition and add the entries.
3. Generate the binary using toBinary().
4. Flash the binary to the NVS partition (the offset is defined in your partition table).

import { NVSPartition, NVSEntry, NVSEncoding } from 'esp-controller/nvs';

// 1\. Create NVS entries  
const ssidEntry \= new NVSEntry('storage', 'wifi_ssid', NVSEncoding.STRING, 'my-wifi-network');  
const passwordEntry \= new NVSEntry('storage', 'wifi_pass', NVSEncoding.STRING, 's3cr3t_p4ssw0rd');  
const retryCountEntry \= new NVSEntry('app_config', 'retry_count', NVSEncoding.U8, 5);

// 2\. Create an NVS partition and add entries  
const nvsPartition \= new NVSPartition('my_nvs');  
nvsPartition.addEntry(ssidEntry);  
nvsPartition.addEntry(passwordEntry);  
nvsPartition.addEntry(retryCountEntry);

// 3\. Generate the binary data  
const nvsBinary \= await nvsPartition.toBinary('20K'); // Size must match partition table

// 4\. Flash the binary to the NVS partition offset (e.g., 0x9000 from the example above)  
await serialController.flash(nvsBinary, 0x9000);

## **Troubleshooting**

- **Connection Failed:** Make sure you have the correct drivers for your ESP device installed (e.g., CP210x or CH340 drivers). Also, ensure no other program (like the Arduino IDE's Serial Monitor) is using the same serial port.
- **Flashing Errors:** Double-check that you are using the correct flash address and that the binary file is not corrupted. Try a different USB cable or port.

## **Contributing**

Contributions are welcome\! If you have a feature request, bug report, or want to contribute to the code, please open an issue or a pull request on the GitHub repository.

## **License**

This project is licensed under the MIT License. See the LICENSE file for more details.

## **🙏 Acknowledgments**

This project would not be possible without the amazing work of the following projects and their contributors. We extend our sincere gratitude for their sources, documentation, and inspiration.

- **esptool-js:** [https://github.com/espressif/esptool-js](https://github.com/espressif/esptool-js) \- For the JavaScript implementation of the esptool protocol.
- **esptool:** [https://github.com/espressif/esptool](https://github.com/espressif/esptool) \- The original Python-based tool for communicating with the ROM bootloader in Espressif chips.
- **webesp:** [https://github.com/sebgerlach/webesp](https://github.com/sebgerlach/webesp) \- For demonstrating the power of the Web Serial API for interacting with ESP devices.
