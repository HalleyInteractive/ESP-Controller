export interface Partition {
  binary: Uint8Array;
  readonly offset: number;
  readonly filename: string;

  load(): Promise<boolean>;
}
