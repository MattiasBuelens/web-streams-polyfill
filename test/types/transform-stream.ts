import * as polyfill from '../../';

let controller!: polyfill.TransformStreamDefaultController<number>;
const transformer: polyfill.Transformer<string, number> = {
  start(c: polyfill.TransformStreamDefaultController<number>) {
    controller = c;
    const desiredSize: number | null = c.desiredSize;
    c.enqueue(5);
    c.error(new TypeError('error'));
    c.terminate();
  },
  transform(chunk: string, c: polyfill.TransformStreamDefaultController<number>) {
    return Promise.resolve();
  },
  flush() {
    return Promise.resolve();
  }
};

const transformStream: polyfill.TransformStream<string, number> = new polyfill.TransformStream<string, number>(
  transformer,
  { highWaterMark: 0, size: (chunk: string) => 1 },
  new CountQueuingStrategy({ highWaterMark: 5 })
);
const writable: polyfill.WritableStream<string> = transformStream.writable;
const readable: polyfill.ReadableStream<number> = transformStream.readable;

// Compatibility with stream types from DOM
const domTransformer: Transformer<string, number> = transformer;
const domTransformStream: TransformStream<string, number> = transformStream;
const domController: TransformStreamDefaultController<number> = controller;
