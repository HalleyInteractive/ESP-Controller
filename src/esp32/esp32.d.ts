interface Partition {
  binary: Uint8Array;
  offset: number;
  filename: string;
  load(): Promise<boolean>;
}
