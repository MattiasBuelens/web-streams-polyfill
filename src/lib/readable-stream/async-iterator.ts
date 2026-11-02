import { ReadableStream } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderCanReadSync,
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
  promiseResolve,
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

export class ReadableStreamAsyncIteratorImpl<R> implements ReadRequest<R> {
  readonly _reader: ReadableStreamDefaultReader<R>;
  readonly _preventCancel: boolean;
  private readonly _nextStepsCallback: () => Promise<ReadableStreamDefaultReadResult<R>>;
  private _ongoingPromise: Promise<ReadableStreamDefaultReadResult<R>> | undefined = undefined;
  private _isFinished = false;

  // Optimization: the iterator is its own read request. Only one read is in flight at a time,
  // so we don't need to allocate a new read request for every chunk.
  // Whether the current read can complete synchronously, and if so, its result.
  private _readIsSync = false;
  private _syncReadPromise: Promise<ReadableStreamDefaultReadResult<R>> | undefined = undefined;
  // The pending asynchronous read.
  private _resolveRead: ((result: ReadableStreamDefaultReadResult<R>) => void) | undefined = undefined;
  private _rejectRead: ((reason: any) => void) | undefined = undefined;
  private readonly _readExecutor: (
    resolve: (result: ReadableStreamDefaultReadResult<R>) => void,
    reject: (reason: any) => void
  ) => void;

  // A chunk that is waiting to be delivered in a microtask.
  private _deliveryPending = false;
  private _deliveryChunk: R | undefined = undefined;
  private _deliveryResolve: ((result: ReadableStreamDefaultReadResult<R>) => void) | undefined = undefined;
  private readonly _deliverChunk: () => void;

  constructor(reader: ReadableStreamDefaultReader<R>, preventCancel: boolean) {
    this._reader = reader;
    this._preventCancel = preventCancel;
    this._nextStepsCallback = () => this._nextSteps();
    this._readExecutor = (resolve, reject) => {
      this._resolveRead = resolve;
      this._rejectRead = reject;
    };
    this._deliverChunk = () => {
      const resolve = this._deliveryResolve!;
      const chunk = this._deliveryChunk!;
      this._deliveryPending = false;
      this._deliveryChunk = undefined;
      this._deliveryResolve = undefined;
      resolve({ value: chunk, done: false });
    };
  }

  next(): Promise<ReadableStreamDefaultReadResult<R>> {
    this._ongoingPromise = this._ongoingPromise !== undefined
      ? transformPromiseWith(this._ongoingPromise, this._nextStepsCallback, this._nextStepsCallback)
      : this._nextSteps();
    return this._ongoingPromise;
  }

  return(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    if (this._ongoingPromise === undefined) {
      this._ongoingPromise = this._returnSteps(value);
    } else {
      const returnStepsCallback = () => this._returnSteps(value);
      this._ongoingPromise = transformPromiseWith(this._ongoingPromise, returnStepsCallback, returnStepsCallback);
    }
    return this._ongoingPromise;
  }

  private _nextSteps(): Promise<ReadableStreamDefaultReadResult<R>> {
    if (this._isFinished) {
      return promiseResolve({ value: undefined, done: true });
    }

    const reader = this._reader;
    assert(reader._ownerReadableStream !== undefined);

    // Fast path: if the read can be resolved synchronously,
    // create a fulfilled/rejected promise directly.
    if (ReadableStreamDefaultReaderCanReadSync(reader)) {
      this._readIsSync = true;
      ReadableStreamDefaultReaderRead(reader, this);
      this._readIsSync = false;
      const promise = this._syncReadPromise!;
      assert(promise !== undefined);
      this._syncReadPromise = undefined;
      return promise;
    }

    if (this._deliveryPending) {
      // The previous chunk is still waiting to be delivered (this can only happen if next() is called
      // synchronously from within enqueue()). Use a separate read request for this read.
      const readRequest = new AsyncIteratorReadRequest<R>(this);
      ReadableStreamDefaultReaderRead(reader, readRequest);
      return readRequest._promise;
    }

    assert(this._resolveRead === undefined);
    const promise = newPromise(this._readExecutor);
    ReadableStreamDefaultReaderRead(reader, this);
    return promise;
  }

  private _returnSteps(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    if (this._isFinished) {
      return promiseResolve({ value, done: true });
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

  /** @internal */
  _chunk(): void {
    this._ongoingPromise = undefined;
  }

  /** @internal */
  _finish(): void {
    this._ongoingPromise = undefined;
    this._isFinished = true;
    ReadableStreamReaderGenericRelease(this._reader);
  }

  /** @internal */
  _chunkSteps(chunk: R): void {
    if (this._readIsSync) {
      assert(this._syncReadPromise === undefined);
      this._chunk();
      this._syncReadPromise = promiseResolve({ value: chunk, done: false });
      return;
    }
    const resolve = this._takeResolveRead();
    this._chunk();
    // This needs to be delayed by one microtask, otherwise we stop pulling too early which breaks a test.
    // FIXME Is this a bug in the specification, or in the test?
    this._deliveryPending = true;
    this._deliveryChunk = chunk;
    this._deliveryResolve = resolve;
    queueMicrotask(this._deliverChunk);
  }

  /** @internal */
  _closeSteps(): void {
    if (this._readIsSync) {
      assert(this._syncReadPromise === undefined);
      this._finish();
      this._syncReadPromise = promiseResolve({ value: undefined, done: true });
      return;
    }
    const resolve = this._takeResolveRead();
    this._finish();
    resolve({ value: undefined, done: true });
  }

  /** @internal */
  _errorSteps(reason: any): void {
    if (this._readIsSync) {
      assert(this._syncReadPromise === undefined);
      this._finish();
      this._syncReadPromise = promiseRejectedWith(reason);
      return;
    }
    const reject = this._rejectRead!;
    assert(reject !== undefined);
    this._resolveRead = undefined;
    this._rejectRead = undefined;
    this._finish();
    reject(reason);
  }

  private _takeResolveRead(): (result: ReadableStreamDefaultReadResult<R>) => void {
    const resolve = this._resolveRead!;
    assert(resolve !== undefined);
    this._resolveRead = undefined;
    this._rejectRead = undefined;
    return resolve;
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
    this._iterator._chunk();
    // This needs to be delayed by one microtask, otherwise we stop pulling too early which breaks a test.
    // FIXME Is this a bug in the specification, or in the test?
    queueMicrotask(() => this._resolvePromise({ value: chunk, done: false }));
  }

  _closeSteps() {
    this._iterator._finish();
    this._resolvePromise({ value: undefined, done: true });
  }

  _errorSteps(reason: any) {
    this._iterator._finish();
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
