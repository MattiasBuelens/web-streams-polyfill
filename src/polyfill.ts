import {
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  ReadableStream,
  TransformStream,
  WritableStream
} from './ponyfill';
import { globals } from './utils';
import ObjectAssign from './stub/object-assign';

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
  ObjectAssign(globals, exports);
}
