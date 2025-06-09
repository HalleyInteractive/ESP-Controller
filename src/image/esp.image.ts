import { Partition } from "./esp.partition";
import { BinFilePartition } from "./esp.bin-file-partition";

export class ESPImage {
  partitions: Array<Partition> = [];

  addBootloader(fileName: string) {
    this.partitions.push(new BinFilePartition(0x1000, fileName));
  }

  addPartitionTable(fileName: string) {
    this.partitions.push(new BinFilePartition(0x8000, fileName));
  }

  addApp(fileName: string) {
    this.partitions.push(new BinFilePartition(0x10000, fileName));
  }

  addPartition(partition: Partition) {
    this.partitions.push(partition);
  }

  async load() {
    for (const partition of this.partitions) {
      await partition.load();
    }
  }
}
