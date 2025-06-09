import { describe, it, expect } from "vitest";
import { EspCommandSync } from "./esp.command.sync";
import { EspPacketDirection, EspCommand } from "./esp.command"; // Assumed import

describe("EspCommandSync", () => {
  it("should initialize with the correct properties for a sync packet", () => {
    // Arrange: Define the expected data payload for the sync command.
    const expectedData = new Uint8Array([
      0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
      0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
      0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    ]);

    // Act: Create a new instance of the command packet.
    const packet = new EspCommandSync();

    // Assert: Verify that all properties of the new packet are correct.
    expect(packet.direction).toBe(EspPacketDirection.REQUEST);
    expect(packet.command).toBe(EspCommand.SYNC);
    expect(packet.data).toEqual(expectedData);
    expect(packet.checksum).toBe(0);
  });
});
