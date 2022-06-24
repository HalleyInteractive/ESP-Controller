export class BinFilePartion implements Partition {
  binary: Uint8Array = new Uint8Array(0);
  constructor(
    public readonly offset: number,
    public readonly filename: string,
  ) {}

  async load(): Promise<boolean> {
    this.binary = new Uint8Array(
      await (await fetch(this.filename)).arrayBuffer()
    );
    return true;
  }
}
