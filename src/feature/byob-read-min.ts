import { IsDetachedBuffer, TransferArrayBuffer } from '../lib/abstract-ops/ecmascript';
import type { ArrayBufferViewConstructor } from '../lib/helpers/array-buffer-view';
import { typeIsObject } from '../lib/helpers/miscellaneous';
import {
  newPromise,
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
      const typedArrayElementSize = getTypedArrayElementSize(view);
      const elementSize = typedArrayElementSize ?? 1;
      if (min > view.byteLength / elementSize) {
        return promiseRejectedWith(new RangeError(typedArrayElementSize === undefined
          ? 'options.min must be less than or equal to view\'s byteLength'
          : 'options.min must be less than or equal to view\'s length'));
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
      return queueRead(this, view, min, elementSize, pending);
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
    elementSize: number,
    pending: Promise<unknown> | undefined
  ): Promise<ReadResult<T>> {
    const cancelCount = cancelCounts.get(reader);
    if (pending !== undefined) {
      // A native read transfers the view's buffer right away, even if it has to wait for earlier reads.
      // Do the same while this read waits for the earlier ones.
      const ctor = view.constructor as ArrayBufferViewConstructor<T>;
      const { byteOffset, byteLength } = view;
      view = new ctor(TransferArrayBuffer(view.buffer as ArrayBuffer), byteOffset, byteLength / elementSize);
    }
    // Register this read before starting it: the native read can call the underlying source's pull() synchronously,
    // and a read() from inside that pull() must wait for this one.
    let settle!: () => void;
    const settled = newPromise<void>((resolve) => {
      settle = resolve;
    });
    pendingReads.set(reader, settled);
    PerformPromiseThen(settled, () => {
      if (pendingReads.get(reader) === settled) {
        pendingReads.delete(reader);
      }
    });
    const doRead = () => (min === 1
      ? reflectCall(nativeRead, reader, [view])
      : readWithMin(nativeRead, reader, view, min, elementSize));
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
    PerformPromiseThen(promise, settle, settle);
    return promise;
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
  min: number,
  elementSize: number
): Promise<ReadResult<T>> {
  const ctor = view.constructor as ArrayBufferViewConstructor<T>;
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

/**
 * Returns the element size of a typed array, or `undefined` for a `DataView`.
 * Unlike checking the constructor, this also works for views from another realm.
 */
function getTypedArrayElementSize(view: ArrayBufferView): number | undefined {
  const elementSize = (view as Partial<Int8Array>).BYTES_PER_ELEMENT;
  return typeof elementSize === 'number' ? elementSize : undefined;
}
