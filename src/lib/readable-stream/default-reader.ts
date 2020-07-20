import assert from '../../stub/assert';
import { SimpleQueue } from '../simple-queue';
import {
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericInitialize,
  ReadableStreamReaderGenericRelease,
  readerLockException,
  ReadResult
} from './generic-reader';
import { IsReadableStreamLocked, ReadableStream } from '../readable-stream';
import { typeIsObject } from '../helpers/miscellaneous';
import { PullSteps } from '../abstract-ops/internal-methods';
import { newPromise, promiseRejectedWith } from '../helpers/webidl';
import { assertRequiredArgument } from '../validators/basic';
import { assertReadableStream } from '../validators/readable-stream';

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

export class ReadableStreamDefaultReader<R = any> {
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

    if (IsReadableStreamLocked(stream)) {
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

    let resolvePromise!: (result: ReadResult<R>) => void;
    let rejectPromise!: (reason: any) => void;
    const promise = newPromise<ReadResult<R>>((resolve, reject) => {
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

  return true;
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
