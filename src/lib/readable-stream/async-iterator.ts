import { ReadableStream } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  type ReadableStreamDefaultReadResult,
  type ReadRequest
} from './default-reader';
import { ReadableStreamReaderGenericCancel, ReadableStreamReaderGenericRelease } from './generic-reader';
import assert from '../../stub/assert';
import { SymbolAsyncIterator } from '../abstract-ops/ecmascript';
import { typeIsObject } from '../helpers/miscellaneous';
import {
  newPromise,
  promiseRejectedWith,
  promiseResolvedWith,
  queueMicrotask,
  transformPromiseWith
} from '../helpers/webidl';

/**
 * An async iterator returned by {@link ReadableStream.values}.
 *
 * @public
 */
export interface ReadableStreamAsyncIterator<R> extends AsyncIterableIterator<R> {
  next(): Promise<IteratorResult<R, undefined>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export class ReadableStreamAsyncIteratorImpl<R> {
  readonly _reader: ReadableStreamDefaultReader<R>;
  readonly _preventCancel: boolean;
  _ongoingPromise: Promise<ReadableStreamDefaultReadResult<R>> | undefined = undefined;
  _isFinished = false;

  constructor(reader: ReadableStreamDefaultReader<R>, preventCancel: boolean) {
    this._reader = reader;
    this._preventCancel = preventCancel;
  }

  next(): Promise<ReadableStreamDefaultReadResult<R>> {
    const nextSteps = () => this._nextSteps();
    this._ongoingPromise = this._ongoingPromise
      ? transformPromiseWith(this._ongoingPromise, nextSteps, nextSteps)
      : nextSteps();
    return this._ongoingPromise;
  }

  return(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    const returnSteps = () => this._returnSteps(value);
    this._ongoingPromise = this._ongoingPromise
      ? transformPromiseWith(this._ongoingPromise, returnSteps, returnSteps)
      : returnSteps();
    return this._ongoingPromise;
  }

  private _nextSteps(): Promise<ReadableStreamDefaultReadResult<R>> {
    if (this._isFinished) {
      return Promise.resolve({ value: undefined, done: true });
    }

    const reader = this._reader;
    assert(reader._ownerReadableStream !== undefined);

    const readRequest = new AsyncIteratorReadRequest<R>(this);
    ReadableStreamDefaultReaderRead(reader, readRequest);
    return readRequest._promise;
  }

  private _returnSteps(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    if (this._isFinished) {
      return Promise.resolve({ value, done: true });
    }
    this._isFinished = true;

    const reader = this._reader;
    assert(reader._ownerReadableStream !== undefined);
    assert(reader._readRequests.length === 0);

    if (!this._preventCancel) {
      const result = ReadableStreamReaderGenericCancel(reader, value);
      ReadableStreamReaderGenericRelease(reader);
      return transformPromiseWith(result, () => ({ value, done: true }));
    }

    ReadableStreamReaderGenericRelease(reader);
    return promiseResolvedWith({ value, done: true });
  }
}

class AsyncIteratorReadRequest<R> implements ReadRequest<R> {
  private readonly _iterator: ReadableStreamAsyncIteratorImpl<R>;
  readonly _promise: Promise<ReadableStreamDefaultReadResult<R>>;
  private _resolvePromise!: (result: ReadableStreamDefaultReadResult<R>) => void;
  private _rejectPromise!: (reason: any) => void;

  constructor(iterator: ReadableStreamAsyncIteratorImpl<R>) {
    this._iterator = iterator;
    this._promise = newPromise((resolve, reject) => {
      this._resolvePromise = resolve;
      this._rejectPromise = reject;
    });
  }

  _chunkSteps(chunk: R) {
    const iterator = this._iterator;
    iterator._ongoingPromise = undefined;
    // This needs to be delayed by one microtask, otherwise we stop pulling too early which breaks a test.
    // FIXME Is this a bug in the specification, or in the test?
    queueMicrotask(() => this._resolvePromise({ value: chunk, done: false }));
  }

  _closeSteps() {
    const iterator = this._iterator;
    iterator._ongoingPromise = undefined;
    iterator._isFinished = true;
    ReadableStreamReaderGenericRelease(iterator._reader);
    this._resolvePromise({ value: undefined, done: true });
  }

  _errorSteps(reason: any) {
    const iterator = this._iterator;
    iterator._ongoingPromise = undefined;
    iterator._isFinished = true;
    ReadableStreamReaderGenericRelease(iterator._reader);
    this._rejectPromise(reason);
  }
}

interface ReadableStreamAsyncIteratorInstance<R> extends ReadableStreamAsyncIterator<R> {
  /** @interal */
  _asyncIteratorImpl: ReadableStreamAsyncIteratorImpl<R>;

  next(): Promise<IteratorResult<R, undefined>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

const ReadableStreamAsyncIteratorPrototype: ReadableStreamAsyncIteratorInstance<any> = {
  next(this: ReadableStreamAsyncIteratorInstance<any>): Promise<ReadableStreamDefaultReadResult<any>> {
    if (!IsReadableStreamAsyncIterator(this)) {
      return promiseRejectedWith(streamAsyncIteratorBrandCheckException('next'));
    }
    return this._asyncIteratorImpl.next();
  },

  return(this: ReadableStreamAsyncIteratorInstance<any>, value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    if (!IsReadableStreamAsyncIterator(this)) {
      return promiseRejectedWith(streamAsyncIteratorBrandCheckException('return'));
    }
    return this._asyncIteratorImpl.return(value);
  },

  // 25.1.3.1 %AsyncIteratorPrototype% [ @@asyncIterator ] ( )
  // https://tc39.github.io/ecma262/#sec-asynciteratorprototype-asynciterator
  [SymbolAsyncIterator]() {
    return this;
  }
} as any;

Object.defineProperty(ReadableStreamAsyncIteratorPrototype, SymbolAsyncIterator, {
  enumerable: false
});

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamAsyncIterator<R>(
  stream: ReadableStream<R>,
  preventCancel: boolean
): ReadableStreamAsyncIterator<R> {
  const reader = AcquireReadableStreamDefaultReader<R>(stream);
  const impl = new ReadableStreamAsyncIteratorImpl(reader, preventCancel);
  const iterator: ReadableStreamAsyncIteratorInstance<R> = Object.create(ReadableStreamAsyncIteratorPrototype);
  iterator._asyncIteratorImpl = impl;
  return iterator;
}

function IsReadableStreamAsyncIterator<R = any>(x: any): x is ReadableStreamAsyncIterator<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_asyncIteratorImpl')) {
    return false;
  }

  try {
    // noinspection SuspiciousTypeOfGuard
    return (x as ReadableStreamAsyncIteratorInstance<any>)._asyncIteratorImpl
      instanceof ReadableStreamAsyncIteratorImpl;
  } catch {
    return false;
  }
}

// Helper functions for the ReadableStream.

function streamAsyncIteratorBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
}
