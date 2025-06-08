import {
  createSerialConnection,
  openPort,
  requestPort,
} from "./serial/serial-controller";

const connection = createSerialConnection();
export async function init() {
  console.log("INIT CONNECTION");
  await requestPort(connection);
  await openPort(connection);
}
