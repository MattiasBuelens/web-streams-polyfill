import {
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  ReadableByteStreamController,
  ReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamBYOBRequest,
  ReadableStreamDefaultController,
  ReadableStreamDefaultReader,
  TransformStream,
  TransformStreamDefaultController,
  WritableStream,
  WritableStreamDefaultController,
  WritableStreamDefaultWriter
} from './ponyfill';

const exports = {
  ReadableStream,
  ReadableStreamDefaultController,
  ReadableByteStreamController,
  ReadableStreamBYOBRequest,
  ReadableStreamDefaultReader,
  ReadableStreamBYOBReader,

  WritableStream,
  WritableStreamDefaultController,
  WritableStreamDefaultWriter,

  ByteLengthQueuingStrategy,
  CountQueuingStrategy,

  TransformStream,
  TransformStreamDefaultController
};

/**
 * Replaces the stream classes on the given global object with our own implementation.
 */
export function installGlobals(target: object): void {
  for (const prop in exports) {
    if (Object.prototype.hasOwnProperty.call(exports, prop)) {
      Object.defineProperty(target, prop, {
        value: exports[prop as (keyof typeof exports)],
        writable: true,
        configurable: true
      });
    }
  }
}
