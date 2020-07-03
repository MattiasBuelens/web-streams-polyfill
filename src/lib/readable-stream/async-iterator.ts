/// <reference lib="es2018.asynciterable" />

import { ReadableStream } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead
} from './default-reader';
import {
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericRelease,
  readerLockException,
  ReadResult
} from './generic-reader';
import assert from '../../stub/assert';
import { promiseRejectedWith, promiseResolvedWith, transformPromiseWith } from '../helpers';
import { AsyncIteratorPrototype } from '@@target/stub/async-iterator-prototype';
import { typeIsObject } from '../helpers/miscellaneous';

export interface ReadableStreamAsyncIterator<R> extends AsyncIterator<R> {
  next(): Promise<IteratorResult<R>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export class ReadableStreamAsyncIteratorImpl<R> {
  private readonly _reader: ReadableStreamDefaultReader<R>;
  private readonly _preventCancel: boolean;
  private _ongoingPromise: Promise<ReadResult<R>> | undefined = undefined;
  private _isFinished = false;

  constructor(reader: ReadableStreamDefaultReader<R>, preventCancel: boolean) {
    this._reader = reader;
    this._preventCancel = preventCancel;
  }

  next(): Promise<ReadResult<R>> {
    const nextSteps = () => this._nextSteps();
    this._ongoingPromise = this._ongoingPromise ?
      transformPromiseWith(this._ongoingPromise, nextSteps, nextSteps) :
      nextSteps();
    return this._ongoingPromise;
  }

  return(value: any): Promise<ReadResult<any>> {
    const returnSteps = () => this._returnSteps(value);
    return this._ongoingPromise ?
      transformPromiseWith(this._ongoingPromise, returnSteps, returnSteps) :
      returnSteps();
  }

  private _nextSteps(): Promise<ReadResult<R>> {
    if (this._isFinished) {
      return Promise.resolve({ value: undefined, done: true });
    }

    const reader = this._reader;
    if (reader._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('iterate'));
    }
    return transformPromiseWith(ReadableStreamDefaultReaderRead(reader), (result): ReadResult<R> => {
      this._ongoingPromise = undefined;
      assert(typeIsObject(result));
      assert(typeof result.done === 'boolean');
      if (result.done) {
        this._isFinished = true;
        ReadableStreamReaderGenericRelease(reader);
        return { value: undefined, done: true };
      }
      return { value: result.value, done: false };
    }, reason => {
      this._ongoingPromise = undefined;
      this._isFinished = true;
      ReadableStreamReaderGenericRelease(reader);
      throw reason;
    });
  }

  private _returnSteps(value: any): Promise<ReadResult<any>> {
    if (this._isFinished) {
      return Promise.resolve({ value, done: true });
    }
    this._isFinished = true;

    const reader = this._reader;
    if (reader._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('finish iterating'));
    }
    if (reader._readRequests.length > 0) {
      return promiseRejectedWith(new TypeError(
        'Tried to release a reader lock when that reader has pending read() calls un-settled'));
    }
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

  next(): Promise<ReadResult<R>>;

  return(value?: any): Promise<ReadResult<any>>;
}

const ReadableStreamAsyncIteratorPrototype: ReadableStreamAsyncIteratorInstance<any> = {
  next(this: ReadableStreamAsyncIteratorInstance<any>): Promise<ReadResult<any>> {
    if (IsReadableStreamAsyncIterator(this) === false) {
      return promiseRejectedWith(streamAsyncIteratorBrandCheckException('next'));
    }
    return this._asyncIteratorImpl.next();
  },

  return(this: ReadableStreamAsyncIteratorInstance<any>, value: any): Promise<ReadResult<any>> {
    if (IsReadableStreamAsyncIterator(this) === false) {
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
                                                      preventCancel = false): ReadableStreamAsyncIterator<R> {
  const reader = AcquireReadableStreamDefaultReader<R>(stream);
  const impl = new ReadableStreamAsyncIteratorImpl(reader, preventCancel);
  const iterator: ReadableStreamAsyncIteratorInstance<R> = Object.create(ReadableStreamAsyncIteratorPrototype);
  iterator._asyncIteratorImpl = impl;
  return iterator;
}

function IsReadableStreamAsyncIterator<R>(x: any): x is ReadableStreamAsyncIterator<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_asyncIteratorImpl')) {
    return false;
  }

  return true;
}

// Helper functions for the ReadableStream.

function streamAsyncIteratorBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
}
