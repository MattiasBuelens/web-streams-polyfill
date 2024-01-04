import assert from '../../stub/assert';
import { SimpleQueue } from '../simple-queue';
import {
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericInitialize,
  ReadableStreamReaderGenericRelease,
  readerLockException
} from './generic-reader';
import { IsReadableStreamLocked, type ReadableByteStream, type ReadableStream } from '../readable-stream';
import {
  IsReadableByteStreamController,
  ReadableByteStreamController,
  ReadableByteStreamControllerPullInto
} from './byte-stream-controller';
import { setFunctionName, typeIsObject } from '../helpers/miscellaneous';
import { newPromise, promiseRejectedWith } from '../helpers/webidl';
import { assertRequiredArgument } from '../validators/basic';
import { assertReadableStream } from '../validators/readable-stream';
import { IsDetachedBuffer } from '../abstract-ops/ecmascript';
import type {
  ReadableStreamBYOBReaderReadOptions,
  ValidatedReadableStreamBYOBReaderReadOptions
} from './reader-options';
import { convertByobReadOptions } from '../validators/reader-options';
import { isDataView, type NonShared, type TypedArray } from '../helpers/array-buffer-view';

/**
 * A result returned by {@link ReadableStreamBYOBReader.read}.
 *
 * @public
 */
export type ReadableStreamBYOBReadResult<T extends ArrayBufferView> = {
  done: false;
  value: T;
} | {
  done: true;
  value: T | undefined;
};

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamBYOBReader(stream: ReadableByteStream): ReadableStreamBYOBReader {
  return new ReadableStreamBYOBReader(stream as ReadableStream<Uint8Array>);
}

// ReadableStream API exposed for controllers.

export function ReadableStreamAddReadIntoRequest<T extends NonShared<ArrayBufferView>>(
  stream: ReadableByteStream,
  readIntoRequest: ReadIntoRequest<T>
): void {
  assert(IsReadableStreamBYOBReader(stream._reader));
  assert(stream._state === 'readable' || stream._state === 'closed');

  (stream._reader! as ReadableStreamBYOBReader)._readIntoRequests.push(readIntoRequest);
}

export function ReadableStreamFulfillReadIntoRequest(stream: ReadableByteStream,
                                                     chunk: ArrayBufferView,
                                                     done: boolean) {
  const reader = stream._reader as ReadableStreamBYOBReader;

  assert(reader._readIntoRequests.length > 0);

  const readIntoRequest = reader._readIntoRequests.shift()!;
  if (done) {
    readIntoRequest._closeSteps(chunk);
  } else {
    readIntoRequest._chunkSteps(chunk);
  }
}

export function ReadableStreamGetNumReadIntoRequests(stream: ReadableByteStream): number {
  return (stream._reader as ReadableStreamBYOBReader)._readIntoRequests.length;
}

export function ReadableStreamHasBYOBReader(stream: ReadableByteStream): boolean {
  const reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (!IsReadableStreamBYOBReader(reader)) {
    return false;
  }

  return true;
}

// Readers

export interface ReadIntoRequest<T extends NonShared<ArrayBufferView>> {
  _chunkSteps(chunk: T): void;

  _closeSteps(chunk: T | undefined): void;

  _errorSteps(e: any): void;
}

/**
 * A BYOB reader vended by a {@link ReadableStream}.
 *
 * @public
 */
export class ReadableStreamBYOBReader {
  /** @internal */
  _ownerReadableStream!: ReadableByteStream;
  /** @internal */
  _closedPromise!: Promise<undefined>;
  /** @internal */
  _closedPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _closedPromise_reject?: (reason: any) => void;
  /** @internal */
  _readIntoRequests: SimpleQueue<ReadIntoRequest<any>>;

  constructor(stream: ReadableStream<Uint8Array>) {
    assertRequiredArgument(stream, 1, 'ReadableStreamBYOBReader');
    assertReadableStream(stream, 'First parameter');

    if (IsReadableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    if (!IsReadableByteStreamController(stream._readableStreamController)) {
      throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte ' +
        'source');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readIntoRequests = new SimpleQueue();
  }

  /**
   * Returns a promise that will be fulfilled when the stream becomes closed, or rejected if the stream ever errors or
   * the reader's lock is released before the stream finishes closing.
   */
  get closed(): Promise<undefined> {
    if (!IsReadableStreamBYOBReader(this)) {
      return promiseRejectedWith(byobReaderBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  /**
   * If the reader is active, behaves the same as {@link ReadableStream.cancel | stream.cancel(reason)}.
   */
  cancel(reason: any = undefined): Promise<void> {
    if (!IsReadableStreamBYOBReader(this)) {
      return promiseRejectedWith(byobReaderBrandCheckException('cancel'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('cancel'));
    }

    return ReadableStreamReaderGenericCancel(this, reason);
  }

  /**
   * Attempts to reads bytes into view, and returns a promise resolved with the result.
   *
   * If reading a chunk causes the queue to become empty, more data will be pulled from the underlying source.
   */
  read<T extends ArrayBufferView>(
    view: T,
    options?: ReadableStreamBYOBReaderReadOptions
  ): Promise<ReadableStreamBYOBReadResult<T>>;
  read<T extends NonShared<ArrayBufferView>>(
    view: T,
    rawOptions: ReadableStreamBYOBReaderReadOptions | null | undefined = {}
  ): Promise<ReadableStreamBYOBReadResult<T>> {
    if (!IsReadableStreamBYOBReader(this)) {
      return promiseRejectedWith(byobReaderBrandCheckException('read'));
    }

    if (!ArrayBuffer.isView(view)) {
      return promiseRejectedWith(new TypeError('view must be an array buffer view'));
    }
    if (view.byteLength === 0) {
      return promiseRejectedWith(new TypeError('view must have non-zero byteLength'));
    }
    if (view.buffer.byteLength === 0) {
      return promiseRejectedWith(new TypeError(`view's buffer must have non-zero byteLength`));
    }
    if (IsDetachedBuffer(view.buffer)) {
      return promiseRejectedWith(new TypeError('view\'s buffer has been detached'));
    }

    let options: ValidatedReadableStreamBYOBReaderReadOptions;
    try {
      options = convertByobReadOptions(rawOptions, 'options');
    } catch (e) {
      return promiseRejectedWith(e);
    }
    const min = options.min;
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

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('read from'));
    }

    let resolvePromise!: (result: ReadableStreamBYOBReadResult<T>) => void;
    let rejectPromise!: (reason: any) => void;
    const promise = newPromise<ReadableStreamBYOBReadResult<T>>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const readIntoRequest: ReadIntoRequest<T> = {
      _chunkSteps: chunk => resolvePromise({ value: chunk, done: false }),
      _closeSteps: chunk => resolvePromise({ value: chunk, done: true }),
      _errorSteps: e => rejectPromise(e)
    };
    ReadableStreamBYOBReaderRead(this, view, min, readIntoRequest);
    return promise;
  }

  /**
   * Releases the reader's lock on the corresponding stream. After the lock is released, the reader is no longer active.
   * If the associated stream is errored when the lock is released, the reader will appear errored in the same way
   * from now on; otherwise, the reader will appear closed.
   *
   * A reader's lock cannot be released while it still has a pending read request, i.e., if a promise returned by
   * the reader's {@link ReadableStreamBYOBReader.read | read()} method has not yet been settled. Attempting to
   * do so will throw a `TypeError` and leave the reader locked to the stream.
   */
  releaseLock(): void {
    if (!IsReadableStreamBYOBReader(this)) {
      throw byobReaderBrandCheckException('releaseLock');
    }

    if (this._ownerReadableStream === undefined) {
      return;
    }

    ReadableStreamBYOBReaderRelease(this);
  }
}

Object.defineProperties(ReadableStreamBYOBReader.prototype, {
  cancel: { enumerable: true },
  read: { enumerable: true },
  releaseLock: { enumerable: true },
  closed: { enumerable: true }
});
setFunctionName(ReadableStreamBYOBReader.prototype.cancel, 'cancel');
setFunctionName(ReadableStreamBYOBReader.prototype.read, 'read');
setFunctionName(ReadableStreamBYOBReader.prototype.releaseLock, 'releaseLock');
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableStreamBYOBReader.prototype, Symbol.toStringTag, {
    value: 'ReadableStreamBYOBReader',
    configurable: true
  });
}

// Abstract operations for the readers.

export function IsReadableStreamBYOBReader(x: any): x is ReadableStreamBYOBReader {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
    return false;
  }

  return x instanceof ReadableStreamBYOBReader;
}

export function ReadableStreamBYOBReaderRead<T extends NonShared<ArrayBufferView>>(
  reader: ReadableStreamBYOBReader,
  view: T,
  min: number,
  readIntoRequest: ReadIntoRequest<T>
): void {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'errored') {
    readIntoRequest._errorSteps(stream._storedError);
  } else {
    ReadableByteStreamControllerPullInto(
      stream._readableStreamController as ReadableByteStreamController,
      view,
      min,
      readIntoRequest
    );
  }
}

export function ReadableStreamBYOBReaderRelease(reader: ReadableStreamBYOBReader) {
  ReadableStreamReaderGenericRelease(reader);
  const e = new TypeError('Reader was released');
  ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e);
}

export function ReadableStreamBYOBReaderErrorReadIntoRequests(reader: ReadableStreamBYOBReader, e: any) {
  const readIntoRequests = reader._readIntoRequests;
  reader._readIntoRequests = new SimpleQueue();
  readIntoRequests.forEach(readIntoRequest => {
    readIntoRequest._errorSteps(e);
  });
}

// Helper functions for the ReadableStreamBYOBReader.

function byobReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamBYOBReader.prototype.${name} can only be used on a ReadableStreamBYOBReader`);
}
