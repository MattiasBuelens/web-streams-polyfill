import { getGlobals, type StreamClasses } from './types';

/**
 * Checks whether the given classes are a native streams implementation that the features can build on:
 * readable streams (including byte streams), writable streams with `controller.signal`,
 * transform streams and `pipeTo()`.
 *
 * If this returns `false`, no feature should be installed on these classes,
 * since that would mix two implementations in one stream graph.
 *
 * @public
 */
export function checkCore(classes: StreamClasses = getGlobals()): boolean {
  const { ReadableStream, WritableStream, TransformStream } = classes;
  if (typeof ReadableStream !== 'function'
    || typeof WritableStream !== 'function'
    || typeof TransformStream !== 'function'
    || typeof ReadableStream.prototype.pipeTo !== 'function') {
    return false;
  }
  try {
    // Byte streams and BYOB readers
    new ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
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
