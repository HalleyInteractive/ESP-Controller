import { describe, it, expect, beforeEach } from "vitest";
import { EspCommandSpiAttach } from "./esp.command.spi-attach";
import { EspCommand, EspPacketDirection } from "./esp.command";

describe("EspCommandSpiAttach", () => {
  let spiAttachCommand: EspCommandSpiAttach;

  beforeEach(() => {
    spiAttachCommand = new EspCommandSpiAttach();
  });

  it("should set the correct command identifier and packet direction", () => {
    // SPI_ATTACH command is identified by 0x0d
    expect(spiAttachCommand.command).toBe(EspCommand.SPI_ATTACH);
    // All host-initiated commands are requests (0x00)
    expect(spiAttachCommand.direction).toBe(EspPacketDirection.REQUEST);
  });

  it("should have the correct data payload size", () => {
    // The payload for SPI_ATTACH is 8 bytes (4 for the value, 4 for ROM loader compatibility)
    expect(spiAttachCommand.size).toBe(8);
  });

  it("should set the checksum to zero", () => {
    // Checksum is not used for SPI_ATTACH and should be 0
    expect(spiAttachCommand.checksum).toBe(0);
  });

  it("should have a data payload of eight zero bytes", () => {
    const dataPayload = spiAttachCommand.data;

    // The payload should be 8 bytes long
    expect(dataPayload.length).toBe(8);

    // All bytes in the payload should be 0
    const allZeros = dataPayload.every((byte) => byte === 0);
    expect(allZeros).toBe(true);
  });

  it("should assemble the complete packet data correctly", () => {
    const fullPacket = spiAttachCommand.getPacketData();
    const dataPayload = spiAttachCommand.data;

    // Manually create the expected packet for verification (8-byte header + 8-byte data)
    const expectedPacket = new Uint8Array(16);
    const view = new DataView(expectedPacket.buffer);

    // Main 8-byte header
    view.setUint8(0, EspPacketDirection.REQUEST); // 0x00
    view.setUint8(1, EspCommand.SPI_ATTACH); // 0x0d
    view.setUint16(2, 8, true); // Size of payload is 8
    view.setUint32(4, 0, true); // Checksum is 0

    // Set the 8-byte data payload
    expectedPacket.set(dataPayload, 8);

    expect(fullPacket).toEqual(expectedPacket);
  });
});
