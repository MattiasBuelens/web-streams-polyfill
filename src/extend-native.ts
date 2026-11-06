import { globals } from './globals';
import * as ponyfill from './ponyfill';
import { createSubclasses, type ExtendNativeExports } from './extend-native/classes';
import { isPatchable } from './feature/index';

// If the native streams implementation is complete enough, extend it with subclasses.
// Otherwise, use our own implementation, so that one stream graph never mixes two implementations.
const classes: ExtendNativeExports = globals !== undefined && isPatchable(globals)
  ? createSubclasses(globals)
  : createPonyfillClasses();

function createPonyfillClasses(): ExtendNativeExports {
  return {
    ...ponyfill,
    adopt(stream: unknown): any {
      if (stream instanceof ponyfill.ReadableStream
        || stream instanceof ponyfill.WritableStream
        || stream instanceof ponyfill.TransformStream) {
        return stream;
      }
      throw new TypeError('The native streams implementation is not supported, so native streams cannot be adopted');
    }
  };
}

export const ReadableStream: typeof ponyfill.ReadableStream = classes.ReadableStream;
export const ReadableStreamDefaultController: typeof ponyfill.ReadableStreamDefaultController
  = classes.ReadableStreamDefaultController;
export const ReadableByteStreamController: typeof ponyfill.ReadableByteStreamController
  = classes.ReadableByteStreamController;
export const ReadableStreamBYOBRequest: typeof ponyfill.ReadableStreamBYOBRequest = classes.ReadableStreamBYOBRequest;
export const ReadableStreamDefaultReader: typeof ponyfill.ReadableStreamDefaultReader
  = classes.ReadableStreamDefaultReader;
export const ReadableStreamBYOBReader: typeof ponyfill.ReadableStreamBYOBReader = classes.ReadableStreamBYOBReader;

export const WritableStream: typeof ponyfill.WritableStream = classes.WritableStream;
export const WritableStreamDefaultController: typeof ponyfill.WritableStreamDefaultController
  = classes.WritableStreamDefaultController;
export const WritableStreamDefaultWriter: typeof ponyfill.WritableStreamDefaultWriter
  = classes.WritableStreamDefaultWriter;

export const ByteLengthQueuingStrategy: typeof ponyfill.ByteLengthQueuingStrategy = classes.ByteLengthQueuingStrategy;
export const CountQueuingStrategy: typeof ponyfill.CountQueuingStrategy = classes.CountQueuingStrategy;

export const TransformStream: typeof ponyfill.TransformStream = classes.TransformStream;
export const TransformStreamDefaultController: typeof ponyfill.TransformStreamDefaultController
  = classes.TransformStreamDefaultController;

/**
 * Converts a stream created by the platform (e.g. `Response.body`, or the sides of a `CompressionStream`)
 * into a stream of this module, in place: it changes the stream's prototype and returns the same object.
 * Streams that are already streams of this module are returned as-is.
 *
 * @public
 */
export const adopt: (stream: unknown) => any = classes.adopt;
