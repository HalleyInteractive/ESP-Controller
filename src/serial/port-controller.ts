export class PortController {
  private serialOptions: SerialOptions = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    bufferSize: 255,
    parity: 'none',
    flowControl: 'none',
  };

  connected: Boolean = false;

  constructor(private readonly port: SerialPort) {}

  async connect() {
    await this.port.open(this.serialOptions);
    this.connected = true;
  }

  async disconnect() {
    await this.port.close();
    this.connected = false;
  }
}
