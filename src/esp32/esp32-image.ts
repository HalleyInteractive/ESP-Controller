import {BinFilePartion} from './bin-file-partition';
import {NVSPartition} from './nvs/nvs-partition';

export class ESPImage {
  partitions: Array<Partition> = [];

  constructor() {}

  addDefault() {
    this.partitions.push(new NVSPartition(0x9000, 'NVS Partition', 0x6000));
    this.partitions.push(new BinFilePartion(0x8000, 'bin/partition-table.bin'));
    this.partitions.push(new BinFilePartion(0x1000, 'bin/bootloader.bin'));
    this.partitions.push(
      new BinFilePartion(0x10000, 'bin/simple_arduino.ino.bin')
    );
  }

  addPartition(partition: Partition) {
    this.partitions.push(partition);
  }

  async load() {
    for (let i = 0; i < this.partitions.length; ++i) {
      await this.partitions[i].load();
    }
  }
}
