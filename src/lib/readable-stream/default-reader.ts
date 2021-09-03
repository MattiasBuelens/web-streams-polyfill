import assert from '../../stub/assert';
import { SimpleQueue } from '../simple-queue';
import {
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericInitialize,
  ReadableStreamReaderGenericRelease,
  readerLockException
} from './generic-reader';
import { IsReadableStreamLocked, ReadableStream } from '../readable-stream';
import { typeIsObject } from '../helpers/miscellaneous';
import { PullSteps } from '../abstract-ops/internal-methods';
import { newPromise, promiseRejectedWith } from '../helpers/webidl';
import { assertRequiredArgument } from '../validators/basic';
import { assertReadableStream } from '../validators/readable-stream';

/**
 * A result returned by {@link ReadableStreamDefaultReader.read}.
 *
 * @public
 */
export type ReadableStreamDefaultReadResult<T> = {
  done: false;
  value: T;
} | {
  done: true;
  value?: undefined;
}

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamDefaultReader<R>(stream: ReadableStream): ReadableStreamDefaultReader<R> {
  return new ReadableStreamDefaultReader(stream);
}

// ReadableStream API exposed for controllers.

export function ReadableStreamAddReadRequest<R>(stream: ReadableStream<R>,
                                                readRequest: ReadRequest<R>): void {
  assert(IsReadableStreamDefaultReader(stream._reader));
  assert(stream._state === 'readable');

  (stream._reader! as ReadableStreamDefaultReader<R>)._readRequests.push(readRequest);
}

export function ReadableStreamFulfillReadRequest<R>(stream: ReadableStream<R>, chunk: R | undefined, done: boolean) {
  const reader = stream._reader as ReadableStreamDefaultReader<R>;

  assert(reader._readRequests.length > 0);

  const readRequest = reader._readRequests.shift()!;
  if (done) {
    readRequest._closeSteps();
  } else {
    readRequest._chunkSteps(chunk!);
  }
}

export function ReadableStreamGetNumReadRequests<R>(stream: ReadableStream<R>): number {
  return (stream._reader as ReadableStreamDefaultReader<R>)._readRequests.length;
}

export function ReadableStreamHasDefaultReader(stream: ReadableStream): boolean {
  const reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (!IsReadableStreamDefaultReader(reader)) {
    return false;
  }

  return true;
}

// Readers

export interface ReadRequest<R> {
  _chunkSteps(chunk: R): void;

  _closeSteps(): void;

  _errorSteps(e: any): void;
}

/**
 * A default reader vended by a {@link ReadableStream}.
 *
 * @public
 */
export class ReadableStreamDefaultReader<R = any> {
  /** @internal */
  _ownerReadableStream!: ReadableStream<R>;
  /** @internal */
  _closedPromise!: Promise<undefined>;
  /** @internal */
  _closedPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _closedPromise_reject?: (reason: any) => void;
  /** @internal */
  _readRequests: SimpleQueue<ReadRequest<R>>;

  constructor(stream: ReadableStream<R>) {
    assertRequiredArgument(stream, 1, 'ReadableStreamDefaultReader');
    assertReadableStream(stream, 'First parameter');

    if (IsReadableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readRequests = new SimpleQueue();
  }

  /**
   * Returns a promise that will be fulfilled when the stream becomes closed,
   * or rejected if the stream ever errors or the reader's lock is released before the stream finishes closing.
   */
  get closed(): Promise<undefined> {
    if (!IsReadableStreamDefaultReader(this)) {
      return promiseRejectedWith(defaultReaderBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  /**
   * If the reader is active, behaves the same as {@link ReadableStream.cancel | stream.cancel(reason)}.
   */
  cancel(reason: any = undefined): Promise<void> {
    if (!IsReadableStreamDefaultReader(this)) {
      return promiseRejectedWith(defaultReaderBrandCheckException('cancel'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('cancel'));
    }

    return ReadableStreamReaderGenericCancel(this, reason);
  }

  /**
   * Returns a promise that allows access to the next chunk from the stream's internal queue, if available.
   *
   * If reading a chunk causes the queue to become empty, more data will be pulled from the underlying source.
   */
  read(): Promise<ReadableStreamDefaultReadResult<R>> {
    if (!IsReadableStreamDefaultReader(this)) {
      return promiseRejectedWith(defaultReaderBrandCheckException('read'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('read from'));
    }

    let resolvePromise!: (result: ReadableStreamDefaultReadResult<R>) => void;
    let rejectPromise!: (reason: any) => void;
    const promise = newPromise<ReadableStreamDefaultReadResult<R>>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const readRequest: ReadRequest<R> = {
      _chunkSteps: chunk => resolvePromise({ value: chunk, done: false }),
      _closeSteps: () => resolvePromise({ value: undefined, done: true }),
      _errorSteps: e => rejectPromise(e)
    };
    ReadableStreamDefaultReaderRead(this, readRequest);
    return promise;
  }

  /**
   * Releases the reader's lock on the corresponding stream. After the lock is released, the reader is no longer active.
   * If the associated stream is errored when the lock is released, the reader will appear errored in the same way
   * from now on; otherwise, the reader will appear closed.
   *
   * A reader's lock cannot be released while it still has a pending read request, i.e., if a promise returned by
   * the reader's {@link ReadableStreamDefaultReader.read | read()} method has not yet been settled. Attempting to
   * do so will throw a `TypeError` and leave the reader locked to the stream.
   */
  releaseLock(): void {
    if (!IsReadableStreamDefaultReader(this)) {
      throw defaultReaderBrandCheckException('releaseLock');
    }

    if (this._ownerReadableStream === undefined) {
      return;
    }

    if (this._readRequests.length > 0) {
      throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
    }

    ReadableStreamReaderGenericRelease(this);
  }
}

Object.defineProperties(ReadableStreamDefaultReader.prototype, {
  cancel: { enumerable: true },
  read: { enumerable: true },
  releaseLock: { enumerable: true },
  closed: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableStreamDefaultReader.prototype, Symbol.toStringTag, {
    value: 'ReadableStreamDefaultReader',
    configurable: true
  });
}

// Abstract operations for the readers.

export function IsReadableStreamDefaultReader<R = any>(x: any): x is ReadableStreamDefaultReader<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
    return false;
  }

  return x instanceof ReadableStreamDefaultReader;
}

export function ReadableStreamDefaultReaderRead<R>(reader: ReadableStreamDefaultReader<R>,
                                                   readRequest: ReadRequest<R>): void {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'closed') {
    readRequest._closeSteps();
  } else if (stream._state === 'errored') {
    readRequest._errorSteps(stream._storedError);
  } else {
    assert(stream._state === 'readable');
    stream._readableStreamController[PullSteps](readRequest as ReadRequest<any>);
  }
}

// Helper functions for the ReadableStreamDefaultReader.

function defaultReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamDefaultReader.prototype.${name} can only be used on a ReadableStreamDefaultReader`);
}
