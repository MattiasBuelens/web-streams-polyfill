import assert from '../../stub/assert';
import { SimpleQueue } from '../simple-queue';
import {
  ReadableStreamCreateReadResult,
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericInitialize,
  ReadableStreamReaderGenericRelease,
  readerLockException,
  ReadResult
} from './generic-reader';
import { IsReadableStream, IsReadableStreamLocked, ReadableStream } from '../readable-stream';
import { typeIsObject } from '../helpers/miscellaneous';
import { PullSteps } from '../abstract-ops/internal-methods';
import { newPromise, promiseRejectedWith, promiseResolvedWith } from '../helpers/webidl';
import { assertRequiredArgument } from '../validators/basic';
import { assertReadableStream } from '../validators/readable-stream';

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamDefaultReader<R>(stream: ReadableStream,
                                                      forAuthorCode = false): ReadableStreamDefaultReader<R> {
  const reader = new ReadableStreamDefaultReader(stream);
  reader._forAuthorCode = forAuthorCode;
  return reader;
}

// ReadableStream API exposed for controllers.

export function ReadableStreamAddReadRequest<R>(stream: ReadableStream<R>): Promise<ReadResult<R>> {
  assert(IsReadableStreamDefaultReader(stream._reader) === true);
  assert(stream._state === 'readable');

  const promise = newPromise<ReadResult<R>>((resolve, reject) => {
    const readRequest: ReadRequest<R> = {
      _resolve: resolve,
      _reject: reject
    };

    (stream._reader! as ReadableStreamDefaultReader<R>)._readRequests.push(readRequest);
  });

  return promise;
}

export function ReadableStreamFulfillReadRequest<R>(stream: ReadableStream<R>, chunk: R | undefined, done: boolean) {
  const reader = stream._reader as ReadableStreamDefaultReader<R>;

  assert(reader._readRequests.length > 0);

  const readRequest = reader._readRequests.shift()!;
  readRequest._resolve(ReadableStreamCreateReadResult(chunk, done, reader._forAuthorCode));
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
  _resolve: (value: ReadResult<R>) => void;
  _reject: (reason: any) => void;
}

export class ReadableStreamDefaultReader<R> {
  /** @internal */
  _forAuthorCode!: boolean;
  /** @internal */
  _ownerReadableStream!: ReadableStream<R>;
  /** @internal */
  _closedPromise!: Promise<void>;
  /** @internal */
  _closedPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _closedPromise_reject?: (reason: any) => void;
  /** @internal */
  _readRequests: SimpleQueue<ReadRequest<R>>;

  constructor(stream: ReadableStream<R>) {
    assertRequiredArgument(stream, 1, 'ReadableStreamDefaultReader');
    assertReadableStream(stream, 'First parameter');

    if (IsReadableStreamLocked(stream) === true) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readRequests = new SimpleQueue();
  }

  get closed(): Promise<void> {
    if (!IsReadableStreamDefaultReader(this)) {
      return promiseRejectedWith(defaultReaderBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  cancel(reason: any = undefined): Promise<void> {
    if (!IsReadableStreamDefaultReader(this)) {
      return promiseRejectedWith(defaultReaderBrandCheckException('cancel'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('cancel'));
    }

    return ReadableStreamReaderGenericCancel(this, reason);
  }

  read(): Promise<ReadResult<R>> {
    if (!IsReadableStreamDefaultReader(this)) {
      return promiseRejectedWith(defaultReaderBrandCheckException('read'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('read from'));
    }

    return ReadableStreamDefaultReaderRead<R>(this);
  }

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

export function IsReadableStreamDefaultReader<R>(x: any): x is ReadableStreamDefaultReader<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
    return false;
  }

  return true;
}

export function ReadableStreamDefaultReaderRead<R>(reader: ReadableStreamDefaultReader<R>): Promise<ReadResult<R>> {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'closed') {
    return promiseResolvedWith(ReadableStreamCreateReadResult<R>(undefined, true, reader._forAuthorCode));
  }

  if (stream._state === 'errored') {
    return promiseRejectedWith(stream._storedError);
  }

  assert(stream._state === 'readable');

  return stream._readableStreamController[PullSteps]() as unknown as Promise<ReadResult<R>>;
}

// Helper functions for the ReadableStreamDefaultReader.

function defaultReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamDefaultReader.prototype.${name} can only be used on a ReadableStreamDefaultReader`);
}
