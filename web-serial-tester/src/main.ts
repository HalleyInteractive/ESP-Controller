import {
  createSerialConnection,
  createLogStreamReader,
  openPort,
  requestPort,
} from "../../src/serial/serial-controller";

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

    const logStreamReader = createLogStreamReader(connection);
    logToConsole(logStreamReader);

    console.log("Connection successful:", connection);
  } catch (error: unknown) {
    // Handle errors, like the user clicking "Cancel"
    if (error instanceof Error) {
      statusDiv.textContent = `Status: Error - ${error.message}`;
    }
    console.error("Connection failed:", error);
  }
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
};

statusDiv.textContent = "Status: Ready. Click the button to connect.";
