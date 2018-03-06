import {
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  ReadableStream,
  TransformStream,
  WritableStream
} from './ponyfill';
import { globals } from './utils';

// Export
export * from './ponyfill';

const exports = {
  ReadableStream,
  WritableStream,
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  TransformStream
};

// Add classes to global scope
if (typeof globals !== 'undefined') {
  Object.assign(globals, exports);
}
