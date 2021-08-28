import * as polyfill from '../../';

let defaultController!: polyfill.ReadableStreamDefaultController<string>;
const underlyingSource: polyfill.UnderlyingSource<string> = {
  start(c: polyfill.ReadableStreamDefaultController<string>) {
    defaultController = c;
    const desiredSize: number | null = c.desiredSize;
    c.enqueue('a');
    c.error(new TypeError('error'));
    c.close();
  },
  pull(c: polyfill.ReadableStreamDefaultController<string>) {
    return Promise.resolve();
  },
  cancel(reason: any) {
    return Promise.resolve();
  }
};

let byteStreamController!: polyfill.ReadableByteStreamController;
let byobRequest!: polyfill.ReadableStreamBYOBRequest;
const underlyingByteSource: polyfill.UnderlyingByteSource = {
  type: 'bytes',
  autoAllocateChunkSize: 1024,
  start(c: polyfill.ReadableByteStreamController) {
    byteStreamController = c;
    const desiredSize: number | null = c.desiredSize;
    const request: polyfill.ReadableStreamBYOBRequest | null = c.byobRequest;
    if (request) {
      byobRequest = request;
      const view: ArrayBufferView | null = request.view;
      request.respond(5);
      request.respondWithNewView(new Uint32Array([4, 5, 6]));
    }
    c.enqueue(new Uint8Array([1, 2, 3]));
    c.error(new TypeError('error'));
    c.close();
  },
  pull(c: polyfill.ReadableByteStreamController) {
    return Promise.resolve();
  },
  cancel(reason: any) {
    return Promise.resolve();
  }
};

const readableStream: polyfill.ReadableStream<string> = new polyfill.ReadableStream<string>(
  underlyingSource,
  { highWaterMark: 0, size: (chunk: string) => 1 }
);
const readableByteStream: polyfill.ReadableStream<Uint8Array> = new polyfill.ReadableStream(
  underlyingByteSource,
  { highWaterMark: 1024 }
);

const locked: boolean = readableStream.locked;

const defaultReader: polyfill.ReadableStreamDefaultReader<string> = readableStream.getReader();
const defaultReaderReadPromise: Promise<polyfill.ReadableStreamDefaultReadResult<string>> = defaultReader.read();
defaultReaderReadPromise.then((result) => {
  const done: boolean = result.done;
  if (result.done) {
    const value: string | undefined = result.value;
  } else {
    const value: string = result.value;
  }
});
const defaultReaderCancelPromise: Promise<void> = defaultReader.cancel('canceled');
const defaultReaderReleaseLockResult: void = defaultReader.releaseLock();

const byobReader: polyfill.ReadableStreamBYOBReader = readableByteStream.getReader({ mode: 'byob' });
const byobReaderReadUint32Promise: Promise<polyfill.ReadableStreamBYOBReadResult<Uint32Array>> = byobReader.read(new Uint32Array(3));
const byobReaderReadDataViewPromise: Promise<polyfill.ReadableStreamBYOBReadResult<DataView>> = byobReader.read(
  new DataView(new ArrayBuffer(3))
);
byobReaderReadUint32Promise.then((result) => {
  const done: boolean = result.done;
  if (result.done) {
    const value: Uint32Array | undefined = result.value;
  } else {
    const value: Uint32Array = result.value;
  }
});
const byobReaderCancelPromise: Promise<void> = byobReader.cancel('canceled');
const byobReaderReleaseLockResult: void = byobReader.releaseLock();

const cancelPromise: Promise<void> = readableStream.cancel('canceled');

const teedStreams: [polyfill.ReadableStream<string>, polyfill.ReadableStream<string>] = readableStream.tee();

const writableStream: polyfill.WritableStream<string> = new polyfill.WritableStream();
const pipePromise: Promise<void> = readableStream
  .pipeTo(writableStream, {
    preventAbort: true,
    preventCancel: false,
    preventClose: true,
    signal: new AbortController().signal
  });
const pipeThroughStream: polyfill.ReadableStream<Uint8Array> = readableStream
  .pipeThrough({ writable: writableStream, readable: readableByteStream }, {
    preventAbort: undefined,
    preventCancel: undefined,
    preventClose: undefined,
    signal: undefined
  });

const valuesResult: polyfill.ReadableStreamAsyncIterator<string> = readableStream.values({ preventCancel: true });

const asyncIterator: polyfill.ReadableStreamAsyncIterator<string> = readableStream[Symbol.asyncIterator]();
const asyncIteratorNextResult: Promise<IteratorResult<string>> = asyncIterator.next();
const asyncIteratorReturnResult: Promise<IteratorResult<any>> = asyncIterator.return('returned');

(async () => {
  for await (const chunk of readableStream) {
    const chunkAsString: string = chunk;
  }
})();

const abortSignal: polyfill.AbortSignal = new AbortController().signal;

// Compatibility with stream types from DOM
// FIXME Re-enable when TypeScript types have been updated to match latest spec
const domUnderlyingSource: UnderlyingSource<string> = underlyingSource;
// const domUnderlyingByteSource: UnderlyingByteSource = underlyingByteSource;

const domReadableStream: ReadableStream<string> = readableStream;
const domReadableByteStream: ReadableStream<Uint8Array> = readableByteStream;

const domDefaultController: ReadableStreamDefaultController<string> = defaultController;
// const domByteStreamController: ReadableByteStreamController = byteStreamController;
// const domByobRequest: ReadableStreamBYOBRequest = byobRequest;

const domDefaultReader: ReadableStreamDefaultReader<string> = defaultReader;
// const domBYOBReader: ReadableStreamBYOBReader = byobReader;
