import { ReadableStreamFromSource, type FromSourceControllerOps } from '../lib/readable-stream/from-source';
import { assertObject } from '../lib/validators/basic';
import { defineMethod, getGlobals, type StreamClasses } from './types';

/**
 * Adds `ReadableStream.from(asyncIterable)`.
 *
 * @public
 */
export const name = 'readable-stream-from';

/**
 * Checks whether `ReadableStream.from()` exists, and rejects non-objects such as strings
 * (as the argument is now an IDL `async_sequence`).
 *
 * @public
 */
export function check(classes: StreamClasses = getGlobals()): boolean {
  const ReadableStream = classes.ReadableStream;
  if (typeof ReadableStream?.from !== 'function') {
    return false;
  }
  try {
    ReadableStream.from('a');
  } catch (e) {
    return e instanceof TypeError;
  }
  return false;
}

/**
 * Installs `ReadableStream.from()` if {@link check} fails.
 * Returns `true` if it was installed.
 *
 * @public
 */
export function install(classes: StreamClasses = getGlobals()): boolean {
  if (check(classes)) {
    return false;
  }
  const ReadableStream = classes.ReadableStream;
  if (typeof ReadableStream !== 'function') {
    throw new TypeError('ReadableStream is not available');
  }

  const controllerOps: FromSourceControllerOps<ReadableStreamDefaultController> = {
    enqueue: (controller, chunk) => controller.enqueue(chunk),
    close: controller => controller.close()
  };

  const { from } = {
    from(asyncIterable: unknown): ReadableStream {
      assertObject(asyncIterable, 'First parameter');
      const source = ReadableStreamFromSource(asyncIterable as AsyncIterable<unknown>, controllerOps);
      // Use objects without a prototype, so the dictionary conversions don't see inherited properties.
      const underlyingSource = Object.create(null);
      underlyingSource.pull = (controller: ReadableStreamDefaultController) => source.pull(controller);
      underlyingSource.cancel = (reason: any) => source.cancel(reason);
      const strategy = Object.create(null);
      strategy.highWaterMark = 0;
      return new ReadableStream(underlyingSource, strategy);
    }
  };
  defineMethod(ReadableStream, 'from', from);
  return true;
}
