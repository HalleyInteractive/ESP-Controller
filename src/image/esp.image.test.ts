import { describe, it, expect, vi } from "vitest";
import { ESPImage } from "./esp.image";
import { BinFilePartition } from "./esp.bin-file-partition";

// Mock the BinFilePartition class
vi.mock("./esp.bin-file-partition", () => {
  const BinFilePartition = vi.fn();
  BinFilePartition.prototype.load = vi.fn(() => Promise.resolve(true));
  return { BinFilePartition };
});

describe("ESPImage", () => {
  it("should add a bootloader partition with the correct offset", () => {
    const image = new ESPImage();
    const filename = "bootloader.bin";
    image.addBootloader(filename);
    expect(image.partitions.length).toBe(1);
    expect(BinFilePartition).toHaveBeenCalledWith(0x1000, filename);
  });

  it("should add a partition table with the correct offset", () => {
    const image = new ESPImage();
    const filename = "partitions.bin";
    image.addPartitionTable(filename);
    expect(image.partitions.length).toBe(1);
    expect(BinFilePartition).toHaveBeenCalledWith(0x8000, filename);
  });

  it("should add an app partition with the correct offset", () => {
    const image = new ESPImage();
    const filename = "app.bin";
    image.addApp(filename);
    expect(image.partitions.length).toBe(1);
    expect(BinFilePartition).toHaveBeenCalledWith(0x10000, filename);
  });

  it("should add a custom partition", () => {
    const image = new ESPImage();
    const mockPartition = {
      offset: 0x9000,
      filename: "custom.bin",
      binary: new Uint8Array(),
      load: vi.fn(),
    };
    image.addPartition(mockPartition);
    expect(image.partitions.length).toBe(1);
    expect(image.partitions[0]).toBe(mockPartition);
  });

  it("should call load on all partitions", async () => {
    const image = new ESPImage();
    const mockPartition1 = { load: vi.fn().mockResolvedValue(true) };
    const mockPartition2 = { load: vi.fn().mockResolvedValue(true) };

    image.addPartition(mockPartition1 as unknown as BinFilePartition);
    image.addPartition(mockPartition2 as unknown as BinFilePartition);

    await image.load();

    expect(mockPartition1.load).toHaveBeenCalledTimes(1);
    expect(mockPartition2.load).toHaveBeenCalledTimes(1);
  });
});
