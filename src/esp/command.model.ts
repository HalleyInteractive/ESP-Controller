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

export enum EspDataPacketDirection {
  REQUEST = 0x00,
  RESPONSE = 0x01,
}

export interface EspDataPacket {
  header: Uint8Array;
  data: Uint8Array;
}

export function setEspDataDirection(
  packet: EspDataPacket,
  direction: EspDataPacketDirection,
): EspDataPacket {
  new DataView(packet.header.buffer, 0, 1).setUint8(0, direction);
  return packet;
}

export function getEspDataDirection(
  packet: EspDataPacket,
): EspDataPacketDirection {
  return new DataView(packet.header.buffer, 0, 1).getUint8(0);
}

export function setEspCommand(
  packet: EspDataPacket,
  command: EspCommand,
): EspDataPacket {
  new DataView(packet.header.buffer, 1, 1).setUint8(0, command);
  return packet;
}

export function getEspCommand(packet: EspDataPacket): EspCommand {
  return new DataView(packet.header.buffer, 1, 1).getUint8(0);
}

export function setEspPackageSize(
  packet: EspDataPacket,
  size: number,
): EspDataPacket {
  new DataView(packet.header.buffer, 2, 2).setUint16(0, size, true);
  return packet;
}

export function getEspPackageSize(packet: EspDataPacket): number {
  return new DataView(packet.header.buffer, 2, 2).getUint16(0, true);
}

export function setEspChecksum(
  packet: EspDataPacket,
  checksum: number,
): EspDataPacket {
  new DataView(packet.header.buffer, 4, 4).setUint32(0, checksum, true);
  return packet;
}

export function getEspChecksum(packet: EspDataPacket): number {
  return new DataView(packet.header.buffer, 4, 4).getUint32(0, true);
}

export function setEspValue(
  packet: EspDataPacket,
  value: number,
): EspDataPacket {
  new DataView(packet.header.buffer, 4, 4).setUint32(0, value, true);
  return packet;
}

export function getEspValue(packet: EspDataPacket): number {
  return new DataView(packet.header.buffer, 4, 4).getUint32(0, true);
}

export function getEspStatus(packet: EspDataPacket): number {
  return new DataView(packet.data.buffer, 0, 1).getUint8(0);
}

export function getEspError(packet: EspDataPacket): number {
  return new DataView(packet.data.buffer, 1, 1).getUint8(0);
}

export function generateEspDataChecksum(data: Uint8Array): number {
  let cs = 0xef;
  for (const byte of data) {
    cs ^= byte;
  }
  return cs;
}

export function setEspData(
  packet: EspDataPacket,
  data: Uint8Array,
): EspDataPacket {
  setEspPackageSize(packet, data.length);
  packet.data = data;
  return packet;
}

export function getEspData(packet: EspDataPacket): Uint8Array {
  return packet.data;
}

export function parseEspResponse(responsePacket: Uint8Array) {
  const responseDataView = new DataView(responsePacket.buffer);
  const packet = { header: new Uint8Array(8), data: new Uint8Array() };
  setEspDataDirection(packet, responseDataView.getUint8(0));
  setEspCommand(packet, responseDataView.getUint8(1));
  setEspPackageSize(packet, responseDataView.getUint16(2, true));
  setEspValue(packet, responseDataView.getUint32(4, true));
  setEspData(packet, responsePacket.slice(8));

  if (getEspStatus(packet) === 1) {
    console.log(getErrorMessage(getEspError(packet)));
  }
}

export function getEspPacketData(packet: EspDataPacket): Uint8Array {
  return new Uint8Array([...packet.header, ...packet.data]);
}

function getErrorMessage(error: number): string {
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
