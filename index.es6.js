import ReadableStream from './spec/reference-implementation/lib/readable-stream';
import WritableStream from './spec/reference-implementation/lib/writable-stream';
import ByteLengthQueuingStrategy from './spec/reference-implementation/lib/byte-length-queuing-strategy';
import CountQueuingStrategy from './spec/reference-implementation/lib/count-queuing-strategy';
import TransformStream from './spec/reference-implementation/lib/transform-stream';
import ReadableByteStream from './spec/reference-implementation/lib/readable-byte-stream';

const interfaces = {
  ReadableByteStream,
  ReadableStream,
  WritableStream,
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  TransformStream
};

// Export
export default interfaces;

// Add classes to global
Object.assign( global, interfaces );
