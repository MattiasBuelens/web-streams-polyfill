'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var ReadableStream = require('./spec/reference-implementation/lib/readable-stream');
var WritableStream = require('./spec/reference-implementation/lib/writable-stream');
var ByteLengthQueuingStrategy = require('./spec/reference-implementation/lib/byte-length-queuing-strategy');
var CountQueuingStrategy = require('./spec/reference-implementation/lib/count-queuing-strategy');
var TransformStream = require('./spec/reference-implementation/lib/transform-stream');
var interfaces = {
  ReadableStream: ReadableStream,
  WritableStream: WritableStream,
  ByteLengthQueuingStrategy: ByteLengthQueuingStrategy,
  CountQueuingStrategy: CountQueuingStrategy,
  TransformStream: TransformStream
};

// Add classes to window
if (typeof window !== "undefined") Object.assign(window, interfaces);

exports.ReadableStream = ReadableStream;
exports.WritableStream = WritableStream;
exports.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
exports.CountQueuingStrategy = CountQueuingStrategy;
exports.TransformStream = TransformStream;
exports.default = interfaces;
