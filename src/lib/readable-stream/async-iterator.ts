/// <reference lib="es2018.asynciterable" />

import type { ReadableStreamDefaultReaderLike, ReadableStreamLike } from '../helpers/stream-like';
import type { ReadableStreamDefaultReadResult } from './default-reader';
import { IsReadableStreamDefaultReader } from './default-reader';
import { readerLockException } from './generic-reader';
import assert from '../../stub/assert';
import { typeIsObject } from '../helpers/miscellaneous';
import { PerformPromiseThen, promiseRejectedWith, promiseResolvedWith, transformPromiseWith } from '../helpers/webidl';

/**
 * An async iterator returned by {@link ReadableStream.values}.
 *
 * @public
 */
export interface ReadableStreamAsyncIterator<R> extends AsyncIterator<R> {
  next(): Promise<IteratorResult<R, undefined>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export class ReadableStreamAsyncIteratorImpl<R> {
  private _reader: ReadableStreamDefaultReaderLike<R> | undefined;
  private readonly _preventCancel: boolean;
  private _ongoingPromise: Promise<ReadableStreamDefaultReadResult<R>> | undefined = undefined;
  private _isFinished = false;

  constructor(reader: ReadableStreamDefaultReaderLike<R>, preventCancel: boolean) {
    this._reader = reader;
    this._preventCancel = preventCancel;
  }

  next(): Promise<ReadableStreamDefaultReadResult<R>> {
    const nextSteps = () => this._nextSteps();
    this._ongoingPromise = this._ongoingPromise ?
      transformPromiseWith(this._ongoingPromise, nextSteps, nextSteps) :
      nextSteps();
    return this._ongoingPromise;
  }

  return(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    const returnSteps = () => this._returnSteps(value);
    return this._ongoingPromise ?
      transformPromiseWith(this._ongoingPromise, returnSteps, returnSteps) :
      returnSteps();
  }

  private _nextSteps(): Promise<ReadableStreamDefaultReadResult<R>> {
    if (this._isFinished) {
      return Promise.resolve({ value: undefined, done: true });
    }

    const reader = this._reader;
    if (reader === undefined) {
      return promiseRejectedWith(readerLockException('iterate'));
    }

    return PerformPromiseThen(reader.read(), result => {
      this._ongoingPromise = undefined;
      if (result.done) {
        this._isFinished = true;
        this._reader?.releaseLock();
        this._reader = undefined;
      }
      return result;
    }, reason => {
      this._ongoingPromise = undefined;
      this._isFinished = true;
      this._reader?.releaseLock();
      this._reader = undefined;
      throw reason;
    });
  }

  private _returnSteps(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    if (this._isFinished) {
      return Promise.resolve({ value, done: true });
    }
    this._isFinished = true;

    const reader = this._reader;
    if (reader === undefined) {
      return promiseRejectedWith(readerLockException('finish iterating'));
    }

    assert(!IsReadableStreamDefaultReader(reader) || reader._readRequests.length === 0);

    this._reader = undefined;
    if (!this._preventCancel) {
      const result = reader.cancel(value);
      reader.releaseLock();
      return transformPromiseWith(result, () => ({ value, done: true }));
    }

    reader.releaseLock();
    return promiseResolvedWith({ value, done: true });
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
  }
} as any;

if (typeof Symbol.asyncIterator === 'symbol') {
  Object.defineProperty(ReadableStreamAsyncIteratorPrototype, Symbol.asyncIterator, {
    // 25.1.3.1 %AsyncIteratorPrototype% [ @@asyncIterator ] ( )
    // https://tc39.github.io/ecma262/#sec-asynciteratorprototype-asynciterator
    value(this: ReadableStreamAsyncIteratorInstance<any>): AsyncIterator<any> {
      return this;
    },
    writable: true,
    configurable: true
  });
}

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamAsyncIterator<R>(stream: ReadableStreamLike<R>,
                                                      preventCancel: boolean): ReadableStreamAsyncIterator<R> {
  const reader = stream.getReader();
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
    return (x as ReadableStreamAsyncIteratorInstance<any>)._asyncIteratorImpl instanceof
      ReadableStreamAsyncIteratorImpl;
  } catch {
    return false;
  }
}

// Helper functions for the ReadableStream.

function streamAsyncIteratorBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
}
