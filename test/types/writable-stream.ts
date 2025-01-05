import * as polyfill from 'web-streams-polyfill';

let controller!: polyfill.WritableStreamDefaultController;
const underlyingSink: polyfill.UnderlyingSink<string> = {
  start(c: polyfill.WritableStreamDefaultController) {
    controller = c;
    c.error(new TypeError('error'));
  },
  write(chunk: string, c: polyfill.WritableStreamDefaultController) {
    return Promise.resolve();
  },
  close() {
    return Promise.resolve();
  },
  abort(reason: any) {
    return Promise.resolve();
  }
};

const writableStream: polyfill.WritableStream<string> = new polyfill.WritableStream<string>(
  underlyingSink,
  { highWaterMark: 0, size: (chunk: string) => 1 }
);

const controllerSignal: polyfill.AbortSignal = controller.signal;
const controllerAbortReason: any = controller.abortReason;

const locked: boolean = writableStream.locked;

const writer: polyfill.WritableStreamDefaultWriter<string> = writableStream.getWriter();
const writerDesiredSize: number | null = writer.desiredSize;
const writerClosedPromise: Promise<void> = writer.closed;
const writerReadyPromise: Promise<void> = writer.ready;
const writerWritePromise: Promise<void> = writer.write('a');
const writerClosePromise: Promise<void> = writer.close();
const writerAbortPromise: Promise<void> = writer.abort('aborted');
const writerReleaseLockResult: void = writer.releaseLock();

const closePromise: Promise<void> = writableStream.close();
const abortPromise: Promise<void> = writableStream.abort('aborted');

// Compatibility with stream types from DOM
declare global {
  interface WritableStreamDefaultController {
    // FIXME Remove deprecated WritableStreamDefaultController.abortReason
    abortReason: any;
  }
}

// const domUnderlyingSink: UnderlyingSink<string> = underlyingSink;
const domWritableStream: WritableStream<string> = writableStream;
// const domController: WritableStreamDefaultController = controller;
const domWriter: WritableStreamDefaultWriter<string> = writer;
