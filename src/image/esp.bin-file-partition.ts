import { Partition } from "./esp.partition";

export class BinFilePartition implements Partition {
  binary: Uint8Array = new Uint8Array(0);

  constructor(
    public readonly offset: number,
    public readonly filename: string,
  ) {}

  async load(): Promise<boolean> {
    try {
      const response = await fetch(this.filename);
      if (!response.ok) {
        console.error(
          `Failed to fetch ${this.filename}: ${response.statusText}`,
        );
        return false;
      }
      this.binary = new Uint8Array(await response.arrayBuffer());
      return true;
    } catch (e) {
      console.error(`Error loading file ${this.filename}:`, e);
      return false;
    }
  }
}
