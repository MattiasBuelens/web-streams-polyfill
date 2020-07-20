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
import { globals } from './utils';

// Export
export * from './ponyfill';

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

// Add classes to global scope
if (typeof globals !== 'undefined') {
  for (const prop in exports) {
    if (Object.prototype.hasOwnProperty.call(exports, prop)) {
      Object.defineProperty(globals, prop, {
        value: exports[prop as (keyof typeof exports)],
        writable: true,
        configurable: true
      });
    }
  }
}
