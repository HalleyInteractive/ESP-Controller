import { ESPImage } from "../../src/image/esp.image";
import {
  createSerialConnection,
  createLogStreamReader,
  openPort,
  requestPort,
  syncEsp,
  flashImage,
} from "../../src/serial/serial-controller";
import { NVSPartition } from "../../src/nvs/nvs-partition";
import { PartitionTable } from "../../src/partition/partition-table";

// --- Get references to our HTML elements ---
const connectButton = document.getElementById(
  "connectButton",
) as HTMLButtonElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;

// --- Main application logic ---
const connection = createSerialConnection();

export async function init() {
  if (!connectButton || !statusDiv) {
    console.error("UI elements not found. Make sure your HTML is correct.");
    return;
  }

  // A security measure: Web Serial API must be triggered by a user action.
  console.log("User requested connection...");
  statusDiv.textContent = "Status: Awaiting port selection...";

  try {
    await requestPort(connection);
    statusDiv.textContent = `Status: Port selected. Opening connection...`;

    await openPort(connection);
    statusDiv.textContent = `Status: Connected!`;
    connectButton.disabled = true; // Disable button after successful connection

    console.log("Connection successful:", connection);
  } catch (error: unknown) {
    // Handle errors, like the user clicking "Cancel"
    if (error instanceof Error) {
      statusDiv.textContent = `Status: Error - ${error.message}`;
    }
    console.error("Connection failed:", error);
  }
}

async function setupLogStream() {
  const logStreamReader = createLogStreamReader(connection);
  logToConsole(logStreamReader);
}

async function flashTestImage() {
  const partitionTable = PartitionTable.singleFactoryAppNoOta();

  const image = new ESPImage();
  image.addBootloader("./binary/bootloader.bin");
  image.addPartition(partitionTable);
  // image.addPartitionTable("./binary/partition-table.bin");
  image.addApp("./binary/simple.bin");

  const nvsPartition = new NVSPartition(0x9000, "nvs.bin");
  nvsPartition.writeEntry("test", "MyWiFi", "wifi");
  nvsPartition.writeEntry("test", "MyPassword", "wifi");
  image.addPartition(nvsPartition);

  await flashImage(connection, image);
}

async function logToConsole(
  logStreamReader: () => AsyncGenerator<string | undefined, void, unknown>,
) {
  for await (const log of logStreamReader()) {
    console.log("SERIAL: ", log);
  }
}

// --- Attach logic to the browser UI ---

// When the "Connect" button is clicked, run our init function.
connectButton.addEventListener("click", init);

// Expose API for debugging or testing from the browser console.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).SerialAPI = {
  init,
  connection,
  syncEsp,
  flashTestImage,
  setupLogStream,
};

statusDiv.textContent = "Status: Ready. Click the button to connect.";
