// This file is used as the entry point for browserifying the reference implementation to allow it
// to run inside the wpt-runner "browser like" context.

import { ReadableStream } from './readable-stream.js';
import { WritableStream } from './writable-stream.js';
import { TransformStream } from './transform-stream.js';
import ByteLengthQueuingStrategy from './byte-length-queuing-strategy.js';
import CountQueuingStrategy from './count-queuing-strategy.js';

window.ReadableStream = ReadableStream;
window.WritableStream = WritableStream;
window.TransformStream = TransformStream;
window.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
window.CountQueuingStrategy = CountQueuingStrategy;
window.gc = gc;
