/// <reference lib="es2018.asynciterable" />

import { ReadableStream } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamDefaultReadResult,
  ReadRequest
} from './default-reader';
import {
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericRelease,
  readerLockException
} from './generic-reader';
import assert from '../../stub/assert';
import { AsyncIteratorPrototype } from '@@target/stub/async-iterator-prototype';
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
export interface ReadableStreamAsyncIterator<R> extends AsyncIterator<R> {
  next(): Promise<IteratorResult<R, undefined>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export class ReadableStreamAsyncIteratorImpl<R> {
  private readonly _reader: ReadableStreamDefaultReader<R>;
  private readonly _preventCancel: boolean;
  private _ongoingPromise: Promise<ReadableStreamDefaultReadResult<R>> | undefined = undefined;
  private _isFinished = false;

  constructor(reader: ReadableStreamDefaultReader<R>, preventCancel: boolean) {
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
    if (reader._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('iterate'));
    }

    let resolvePromise!: (result: ReadableStreamDefaultReadResult<R>) => void;
    let rejectPromise!: (reason: any) => void;
    const promise = newPromise<ReadableStreamDefaultReadResult<R>>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const readRequest: ReadRequest<R> = {
      _chunkSteps: chunk => {
        this._ongoingPromise = undefined;
        // This needs to be delayed by one microtask, otherwise we stop pulling too early which breaks a test.
        // FIXME Is this a bug in the specification, or in the test?
        queueMicrotask(() => resolvePromise({ value: chunk, done: false }));
      },
      _closeSteps: () => {
        this._ongoingPromise = undefined;
        this._isFinished = true;
        ReadableStreamReaderGenericRelease(reader);
        resolvePromise({ value: undefined, done: true });
      },
      _errorSteps: reason => {
        this._ongoingPromise = undefined;
        this._isFinished = true;
        ReadableStreamReaderGenericRelease(reader);
        rejectPromise(reason);
      }
    };
    ReadableStreamDefaultReaderRead(reader, readRequest);
    return promise;
  }

  private _returnSteps(value: any): Promise<ReadableStreamDefaultReadResult<any>> {
    if (this._isFinished) {
      return Promise.resolve({ value, done: true });
    }
    this._isFinished = true;

    const reader = this._reader;
    if (reader._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('finish iterating'));
    }

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

declare class ReadableStreamAsyncIteratorInstance<R> implements ReadableStreamAsyncIterator<R> {
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
if (AsyncIteratorPrototype !== undefined) {
  Object.setPrototypeOf(ReadableStreamAsyncIteratorPrototype, AsyncIteratorPrototype);
}

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamAsyncIterator<R>(stream: ReadableStream<R>,
                                                      preventCancel: boolean): ReadableStreamAsyncIterator<R> {
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
