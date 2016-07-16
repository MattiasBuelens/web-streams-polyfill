const ReadableStream = require('./spec/reference-implementation/lib/readable-stream');
const WritableStream = require('./spec/reference-implementation/lib/writable-stream');
const ByteLengthQueuingStrategy = require('./spec/reference-implementation/lib/byte-length-queuing-strategy');
const CountQueuingStrategy = require('./spec/reference-implementation/lib/count-queuing-strategy');
const TransformStream = require('./spec/reference-implementation/lib/transform-stream');
const interfaces = {
  ReadableStream,
  WritableStream,
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  TransformStream
};

// Add classes to window
if ( typeof window !== "undefined" )
  Object.assign( window, interfaces );

export { ReadableStream, WritableStream, ByteLengthQueuingStrategy, CountQueuingStrategy, TransformStream };export default interfaces;