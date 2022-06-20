export enum ESP32DataPacketDirection {
  REQUEST = 0x00,
  RESPONSE = 0x01,
}

export enum ESP32Command {
  SYNC = 0x08,
  READ_REG = 0x0a,
}

export class ESP32DataPacket {
  private packetHeader: Uint8Array = new Uint8Array(8);
  private packetData: Uint8Array = new Uint8Array();

  set direction(direction: ESP32DataPacketDirection) {
    new DataView(this.packetHeader.buffer, 0, 1).setUint8(0, direction);
  }

  get direction(): ESP32DataPacketDirection {
    return new DataView(this.packetHeader.buffer, 0, 1).getUint8(0);
  }

  set command(command: ESP32Command) {
    new DataView(this.packetHeader.buffer, 1, 1).setUint8(0, command);
  }

  get command(): ESP32Command {
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

  generateChecksum(data: Uint8Array): number {
    let cs = 0xef;
    for (const byte of data) {
      cs ^= byte;
    }
    return cs;
  }

  set data(packetData: Uint8Array) {
    // TODO: Do I need sequence number and length in data packet?
    // https://docs.espressif.com/projects/esptool/en/latest/esp32s2/advanced-topics/serial-protocol.html#checksum
    this.size = packetData.length;
    this.checksum = this.generateChecksum(packetData);
    this.packetData = packetData;
  }

  get data(): Uint8Array {
    return this.data;
  }

  parseResponse(responsePacket: Uint8Array) {
    const responseDataView = new DataView(responsePacket.buffer);
    this.direction = responseDataView.getUint8(1) as ESP32DataPacketDirection;
    this.command = responseDataView.getUint8(1) as ESP32Command;
    this.size = responseDataView.getUint16(2, true);
    this.value = responseDataView.getUint32(4, true);
    this.packetData = responsePacket.slice(8);
  }

  getPacketData(): Uint8Array {
    return new Uint8Array([...this.packetHeader, ...this.packetData]);
  }
}
