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
import ObjectAssign from './stub/object-assign';

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
  WritableStreamDefaultWriter,
  WritableStreamDefaultController,

  ByteLengthQueuingStrategy,
  CountQueuingStrategy,

  TransformStream,
  TransformStreamDefaultController
};

// Add classes to global scope
if (typeof globals !== 'undefined') {
  ObjectAssign(globals, exports);
}
