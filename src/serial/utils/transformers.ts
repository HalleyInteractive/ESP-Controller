export class LoggingTransformer implements Transformer<string, string> {
  constructor(public logPrefix: string = 'STREAM LOG: ') {}
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

export class Uint8LoggingTransformer
  implements Transformer<Uint8Array, Uint8Array>
{
  constructor(public logPrefix: string = 'UINT8 STREAM LOG: ') {}
  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    console.log(this.logPrefix, chunk);
    controller.enqueue(chunk);
  }
}

export class LineBreakTransformer implements Transformer<string, string> {
  buffer: string | undefined = '';
  transform(
    chunk: string,
    controller: TransformStreamDefaultController<string>
  ) {
    this.buffer += chunk;
    const lines = this.buffer?.split('\r\n');
    this.buffer = lines?.pop();
    lines?.forEach(line => controller.enqueue(line));
  }
}
