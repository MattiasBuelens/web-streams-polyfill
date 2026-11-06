import { getGlobals, type StreamClasses } from './types';

/**
 * Checks whether the given classes are a native streams implementation that the features can build on:
 * readable streams, writable streams with `controller.signal`, transform streams and `pipeTo()`.
 * (Byte streams are not required, since the `readable-byte-streams` feature can install them.)
 *
 * If this returns `false`, no feature should be installed on these classes,
 * since that would mix two implementations in one stream graph.
 *
 * @public
 */
export function isPatchable(classes: StreamClasses = getGlobals()): boolean {
  const { ReadableStream, WritableStream, TransformStream } = classes;
  if (typeof ReadableStream !== 'function'
    || typeof WritableStream !== 'function'
    || typeof TransformStream !== 'function'
    || typeof ReadableStream.prototype.pipeTo !== 'function') {
    return false;
  }
  try {
    // WritableStreamDefaultController.signal (start() is called synchronously)
    let hasSignal = false;
    new WritableStream({
      start(controller: any) {
        hasSignal = typeof AbortSignal === 'function' && controller.signal instanceof AbortSignal;
      }
    });
    return hasSignal;
  } catch {
    return false;
  }
}
