import { describe, it, expect, beforeEach } from "vitest";
import {
  EspCommand,
  EspCommandPacket,
  EspPacketDirection,
} from "./esp.command";

describe("EspCommandPacket", () => {
  let packet: EspCommandPacket;

  // Before each test, create a fresh instance of EspCommandPacket
  beforeEach(() => {
    packet = new EspCommandPacket();
  });

  it("should initialise with default values or empty state", () => {
    // After instantiation, packetHeader should be 8 bytes, packetData should be empty
    expect(packet.getPacketData().byteLength).toBe(8); // Header only
    expect(packet.direction).toBe(0); // Assuming default is 0 or uninitialised, usually EspPacketDirection.REQUEST for a command
    expect(packet.command).toBe(0); // Assuming default is 0 or uninitialised
    expect(packet.size).toBe(0); // No data set initially
    expect(packet.checksum).toBe(0); // No checksum set initially
    expect(packet.value).toBe(0); // No value set initially
    expect(packet.data.byteLength).toBe(0); // No data set initially
  });

  describe("Header Field Setters and Getters", () => {
    it("should correctly set and get direction", () => {
      packet.direction = EspPacketDirection.REQUEST; // 0x00
      expect(packet.direction).toBe(EspPacketDirection.REQUEST);
      packet.direction = EspPacketDirection.RESPONSE; // 0x01
      expect(packet.direction).toBe(EspPacketDirection.RESPONSE);
    });

    it("should correctly set and get command", () => {
      packet.command = EspCommand.FLASH_BEGIN; // 0x02
      expect(packet.command).toBe(EspCommand.FLASH_BEGIN);
      packet.command = EspCommand.SYNC; // 0x08
      expect(packet.command).toBe(EspCommand.SYNC);
    });

    it("should correctly get size with little-endian byte order", () => {
      packet.data = new Uint8Array([0x0, 0x0, 0x0, 0x0, 0x0]);
      expect(packet.size).toBe(5);
      packet.data = new Uint8Array([0x0, 0x0, 0x0]);
      expect(packet.size).toBe(3);
    });

    it("should correctly set and get checksum with little-endian byte order", () => {
      packet.data = new Uint8Array([0x0, 0x0, 0x0]);
      expect(packet.checksum).toBe(0);
      const testChecksum = 0x12345678;
      packet.checksum = testChecksum;
      expect(packet.checksum).toBe(testChecksum);
      // Verify underlying bytes for 0x12345678 are 0x78, 0x56, 0x34, 0x12 due to little-endian
      const packetBytes = packet.getPacketData();
      expect(packetBytes[4]).toBe(0x78);
      expect(packetBytes[5]).toBe(0x56);
      expect(packetBytes[6]).toBe(0x34);
      expect(packetBytes[7]).toBe(0x12);
    });

    it("should correctly set and get value (alias for checksum) with little-endian byte order", () => {
      const testValue = 0xabcdef01;
      packet.value = testValue;
      expect(packet.value).toBe(testValue);
      // Verify underlying bytes for 0xABCDEF01 are 0x01, 0xEF, 0xCD, 0xAB due to little-endian
      const packetBytes = packet.getPacketData();
      expect(packetBytes[4]).toBe(0x01);
      expect(packetBytes[5]).toBe(0xef);
      expect(packetBytes[6]).toBe(0xcd);
      expect(packetBytes[7]).toBe(0xab);
    });
  });

  describe("Data Payload Management", () => {
    it("should correctly set and get data payload", () => {
      const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      packet.data = testData;
      expect(packet.data).toEqual(testData);
      expect(packet.data.byteLength).toBe(4);
    });

    it("should automatically update packet size when data payload is set", () => {
      const testData = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
      packet.data = testData;
      // The 'size' property should automatically reflect the length of the data
      expect(packet.size).toBe(testData.byteLength);
    });

    it("should handle empty data payload", () => {
      const emptyData = new Uint8Array([]);
      packet.data = emptyData;
      expect(packet.data).toEqual(emptyData);
      expect(packet.size).toBe(0);
    });
  });

  describe("Checksum Generation", () => {
    it("should correctly generate checksum for an empty array", () => {
      // Checksum starts at 0xEF
      expect(packet.generateChecksum(new Uint8Array([]))).toBe(0xef);
    });

    it("should correctly generate checksum for a single byte", () => {
      // 0xEF ^ 0x01 = 0xEE
      expect(packet.generateChecksum(new Uint8Array([0x01]))).toBe(0xee);
    });

    it("should correctly generate checksum for multiple bytes", () => {
      expect(packet.generateChecksum(new Uint8Array([0x01, 0x02, 0x03]))).toBe(
        0xef,
      );
    });

    it("should correctly generate checksum when XOR results in 0x00", () => {
      // 0xEF ^ 0xEF = 0x00
      expect(packet.generateChecksum(new Uint8Array([0xef]))).toBe(0x00);
    });
  });

  describe("Packet Assembly (getPacketData)", () => {
    it("should return a packet with only the header if no data is set", () => {
      packet.direction = EspPacketDirection.REQUEST;
      packet.command = EspCommand.SYNC;
      packet.size = 0; // Explicitly set to 0, though it would be if data is empty
      packet.checksum = 0; // Checksum is ignored for SYNC, so it's 0

      const expectedPacket = new Uint8Array([
        EspPacketDirection.REQUEST, // 0x00
        EspCommand.SYNC, // 0x08
        0x00,
        0x00, // Size: 0 (little-endian)
        0x00,
        0x00,
        0x00,
        0x00, // Checksum/Value: 0 (little-endian)
      ]);

      expect(packet.getPacketData()).toEqual(expectedPacket);
      expect(packet.getPacketData().byteLength).toBe(8);
    });

    it("should return a complete packet with header and data", () => {
      packet.direction = EspPacketDirection.REQUEST;
      packet.command = EspCommand.FLASH_DATA;
      const testData = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
      packet.data = testData;
      packet.checksum = packet.generateChecksum(testData);

      const expectedHeader = new Uint8Array([
        EspPacketDirection.REQUEST, // 0x00
        EspCommand.FLASH_DATA, // 0x03
        0x04,
        0x00,
        0xef,
        0x00,
        0x00,
        0x00,
      ]);
      const expectedPacket = new Uint8Array([...expectedHeader, ...testData]);

      expect(packet.getPacketData()).toEqual(expectedPacket);
      expect(packet.getPacketData().byteLength).toBe(8 + testData.byteLength);
    });
  });

  describe("Response Parsing (parseResponse)", () => {
    it("should correctly parse a successful response packet", () => {
      // Mock successful response packet
      // Direction: 0x01 (RESPONSE)
      // Command: 0x02 (FLASH_BEGIN)
      // Size: 0x02 (2 bytes for status: 0x00 success, 0x00 error_code)
      // Value: 0x12345678 (example value, often 0 for FLASH_BEGIN)
      // Data: 0x00 (Status success), 0x00 (Error code none)
      const mockResponse = new Uint8Array([
        EspPacketDirection.RESPONSE, // 0x01
        EspCommand.FLASH_BEGIN, // 0x02
        0x02,
        0x00, // Size: 2 (little-endian)
        0x78,
        0x56,
        0x34,
        0x12, // Value: 0x12345678 (little-endian)
        0x00, // Status: 0 (Success)
        0x00, // Error: 0 (No error)
      ]);

      packet.parseResponse(mockResponse);

      expect(packet.direction).toBe(EspPacketDirection.RESPONSE);
      expect(packet.command).toBe(EspCommand.FLASH_BEGIN);
      expect(packet.size).toBe(2);
      expect(packet.value).toBe(0x12345678);
      expect(packet.data).toEqual(new Uint8Array([0x00, 0x00])); // The status bytes are the data payload
      expect(packet.status).toBe(0x00); // Success
      expect(packet.error).toBe(0x00); // No error
      expect(packet.getErrorMessage(packet.error)).toBe(
        "No error status for response",
      );
    });

    it("should correctly parse a failed response packet and log error", () => {
      // Mock failed response packet (e.g., Status Error 0x05)
      const mockErrorResponse = new Uint8Array([
        EspPacketDirection.RESPONSE, // 0x01
        EspCommand.FLASH_BEGIN, // 0x02
        0x02,
        0x00, // Size: 2
        0x00,
        0x00,
        0x00,
        0x00, // Value: 0 (often 0 on error)
        0x01, // Status: 1 (Failure)
        0x05, // Error: 0x05 (Received message is invalid)
      ]);

      // Spy on console.log to check if error message is logged
      const consoleSpy = vitest.spyOn(console, "log");

      packet.parseResponse(mockErrorResponse);

      expect(packet.direction).toBe(EspPacketDirection.RESPONSE);
      expect(packet.command).toBe(EspCommand.FLASH_BEGIN);
      expect(packet.size).toBe(2);
      expect(packet.value).toBe(0x00000000);
      expect(packet.data).toEqual(new Uint8Array([0x01, 0x05]));
      expect(packet.status).toBe(0x01); // Failure
      expect(packet.error).toBe(0x05); // Invalid message error

      expect(consoleSpy).toHaveBeenCalledWith(
        "Status Error: Received message is invalid. (parameters or length field is invalid)",
      );
      consoleSpy.mockRestore(); // Clean up the spy
    });
  });

  describe("Error Message Retrieval (getErrorMessage)", () => {
    it("should return correct error message for 0x05", () => {
      expect(packet.getErrorMessage(0x05)).toBe(
        "Status Error: Received message is invalid. (parameters or length field is invalid)",
      );
    });

    it("should return correct error message for 0x06", () => {
      expect(packet.getErrorMessage(0x06)).toBe(
        "Failed to act on received message",
      );
    });

    it("should return correct error message for 0x07", () => {
      expect(packet.getErrorMessage(0x07)).toBe("Invalid CRC in message");
    });

    it("should return correct error message for 0x08", () => {
      expect(packet.getErrorMessage(0x08)).toBe(
        "flash write error - after writing a block of data to flash, the ROM loader reads the value back and the 8-bit CRC is compared to the data read from flash. If they don't match, this error is returned.",
      );
    });

    it("should return correct error message for 0x09", () => {
      expect(packet.getErrorMessage(0x09)).toBe(
        "flash read error - SPI read failed",
      );
    });

    it("should return correct error message for 0x0A", () => {
      expect(packet.getErrorMessage(0x0a)).toBe(
        "flash read length error - SPI read request length is too long",
      );
    });

    it("should return correct error message for 0x0B", () => {
      expect(packet.getErrorMessage(0x0b)).toBe(
        "Deflate error (compressed uploads only)",
      );
    });

    it("should return default message for unknown error codes", () => {
      expect(packet.getErrorMessage(0xff)).toBe("No error status for response");
      expect(packet.getErrorMessage(0x00)).toBe("No error status for response");
    });
  });
});
