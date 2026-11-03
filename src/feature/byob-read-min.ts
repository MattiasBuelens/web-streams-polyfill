import { IsDetachedBuffer } from '../lib/abstract-ops/ecmascript';
import {
  arrayBufferViewElementSize,
  isDataView,
  type ArrayBufferViewConstructor,
  type TypedArray
} from '../lib/helpers/array-buffer-view';
import { typeIsObject } from '../lib/helpers/miscellaneous';
import {
  PerformPromiseThen,
  promiseRejectedWith,
  reflectCall,
  setPromiseIsHandledToTrue
} from '../lib/helpers/webidl';
import { convertByobReadOptions } from '../lib/validators/reader-options';
import { replaceMethod } from './patch';
import { getGlobals, type StreamClasses } from './types';

/**
 * Adds the `min` option to `ReadableStreamBYOBReader.prototype.read(view, { min })`.
 *
 * @public
 */
export const name = 'byob-read-min';

/**
 * Checks whether `ReadableStreamBYOBReader.prototype.read()` supports the `min` option.
 *
 * @public
 */
export function check(classes: StreamClasses = getGlobals()): boolean {
  const reader = getByobReader(classes);
  if (reader === undefined) {
    return false;
  }
  // The options dictionary is converted synchronously, so a getter tells whether `min` is read.
  let accessed = false;
  try {
    const promise = reader.read(new Uint8Array(1), {
      get min() {
        accessed = true;
        return 1;
      }
    });
    setPromiseIsHandledToTrue(promise);
  } catch {
    return false;
  }
  return accessed;
}

type ReadResult<T extends ArrayBufferView> = { done: false; value: T } | { done: true; value: T | undefined };
type NativeRead = <T extends ArrayBufferView>(this: ReadableStreamBYOBReader, view: T) => Promise<ReadResult<T>>;

/**
 * Installs support for `read(view, { min })` if {@link check} fails.
 * Returns `true` if it was installed.
 *
 * The native `read(view)` is called repeatedly, on the part of the view that's still empty,
 * until at least `min` elements are filled.
 * While such a read is pending, later `read()` calls on the same reader wait for it, so reads still complete in order.
 *
 * @public
 */
export function install(classes: StreamClasses = getGlobals()): boolean {
  if (check(classes)) {
    return false;
  }
  const probe = getByobReader(classes);
  if (probe === undefined) {
    return false;
  }
  const prototype = Object.getPrototypeOf(probe);
  // Settles when the last pending read on a reader settles, as long as that read
  // (or a read before it) still needs more than one native read.
  const pendingReads = new WeakMap<object, Promise<unknown>>();
  // Counts the cancel() calls on a reader, to know whether it was cancelled while a read was pending.
  const cancelCounts = new WeakMap<object, number>();

  const { read } = {
    read<T extends ArrayBufferView>(
      this: ReadableStreamBYOBReader,
      view: T,
      rawOptions: { min?: number } | null | undefined = {}
    ): Promise<ReadResult<T>> {
      if (!ArrayBuffer.isView(view)) {
        return promiseRejectedWith(new TypeError('view must be an array buffer view'));
      }
      if (view.byteLength === 0) {
        return promiseRejectedWith(new TypeError('view must have non-zero byteLength'));
      }
      if (view.buffer.byteLength === 0) {
        return promiseRejectedWith(new TypeError(`view's buffer must have non-zero byteLength`));
      }
      if (IsDetachedBuffer(view.buffer as ArrayBuffer)) {
        return promiseRejectedWith(new TypeError('view\'s buffer has been detached'));
      }
      let min: number;
      try {
        min = convertByobReadOptions(rawOptions, 'options').min;
      } catch (e) {
        return promiseRejectedWith(e);
      }
      if (min === 0) {
        return promiseRejectedWith(new TypeError('options.min must be greater than 0'));
      }
      if (!isDataView(view)) {
        if (min > (view as unknown as TypedArray).length) {
          return promiseRejectedWith(new RangeError('options.min must be less than or equal to view\'s length'));
        }
      } else if (min > view.byteLength) {
        return promiseRejectedWith(new RangeError('options.min must be less than or equal to view\'s byteLength'));
      }

      if (!typeIsObject(this)) {
        // Let the native method reject with its own brand check error.
        return reflectCall(nativeRead, this, [view]);
      }
      const pending = pendingReads.get(this);
      if (pending === undefined && min === 1) {
        // Fast path: a single native read is enough, and nothing is waiting before it.
        return reflectCall(nativeRead, this, [view]);
      }
      return queueRead(this, view, min, pending);
    }
  };
  const { cancel } = {
    cancel(this: ReadableStreamBYOBReader, ...args: [reason?: any]): Promise<void> {
      if (typeIsObject(this) && pendingReads.has(this)) {
        cancelCounts.set(this, (cancelCounts.get(this) ?? 0) + 1);
      }
      return reflectCall(nativeCancel, this, args);
    }
  };
  const nativeRead = replaceMethod(prototype, 'read', read) as NativeRead;
  const nativeCancel = replaceMethod(prototype, 'cancel', cancel);

  function queueRead<T extends ArrayBufferView>(
    reader: ReadableStreamBYOBReader,
    view: T,
    min: number,
    pending: Promise<unknown> | undefined
  ): Promise<ReadResult<T>> {
    const cancelCount = cancelCounts.get(reader);
    const doRead = () => (min === 1
      ? reflectCall(nativeRead, reader, [view])
      : readWithMin(nativeRead, reader, view, min));
    const promise = PerformPromiseThen(
      pending === undefined ? doRead() : PerformPromiseThen(pending, doRead, doRead),
      (result): ReadResult<T> => {
        if (result.done && cancelCounts.get(reader) !== cancelCount) {
          // The reader was cancelled while this read was pending, so it resolves without a view,
          // even if it only started its native read after that.
          return { done: true, value: undefined };
        }
        return result;
      }
    );
    trackPendingRead(reader, promise);
    return promise;
  }

  function trackPendingRead(reader: object, promise: Promise<unknown>) {
    const settled = PerformPromiseThen(promise, noop, noop);
    pendingReads.set(reader, settled);
    PerformPromiseThen(settled, () => {
      if (pendingReads.get(reader) === settled) {
        pendingReads.delete(reader);
      }
    });
  }

  return true;
}

/**
 * Reads into `view` until at least `min` elements are filled, the stream closes,
 * or the stream is cancelled or errored.
 */
function readWithMin<T extends ArrayBufferView>(
  nativeRead: NativeRead,
  reader: ReadableStreamBYOBReader,
  view: T,
  min: number
): Promise<ReadResult<T>> {
  const ctor = view.constructor as ArrayBufferViewConstructor<T>;
  const elementSize = arrayBufferViewElementSize(ctor);
  const byteOffset = view.byteOffset;
  const byteLength = view.byteLength;
  const minimumFill = min * elementSize;
  let bytesFilled = 0;
  let first = true;
  const onResult = (result: ReadResult<T>): ReadResult<T> | Promise<ReadResult<T>> => {
    const value = result.value;
    if (value === undefined) {
      // The stream was cancelled.
      return result;
    }
    // Each read transfers the buffer, so continue with the latest one.
    const buffer = value.buffer as ArrayBuffer;
    bytesFilled += value.byteLength;
    if (result.done || bytesFilled >= minimumFill) {
      if (first) {
        // The first read already returned the whole result.
        return result;
      }
      return { done: result.done, value: new ctor(buffer, byteOffset, bytesFilled / elementSize) } as ReadResult<T>;
    }
    first = false;
    // Every native read fills whole elements, so the rest of the view stays aligned.
    const rest = new ctor(buffer, byteOffset + bytesFilled, (byteLength - bytesFilled) / elementSize);
    return PerformPromiseThen(reflectCall(nativeRead, reader, [rest]), onResult);
  };
  return PerformPromiseThen(reflectCall(nativeRead, reader, [view]), onResult);
}

function getByobReader(classes: StreamClasses): ReadableStreamBYOBReader | undefined {
  const ReadableStream = classes.ReadableStream;
  if (typeof ReadableStream !== 'function') {
    return undefined;
  }
  try {
    return new ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
  } catch {
    return undefined;
  }
}

function noop() {
  // do nothing
}
