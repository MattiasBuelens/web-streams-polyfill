/// <reference lib="es2018.asynciterable" />

import { ReadableStream } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead
} from './default-reader';
import {
  ReadableStreamCreateReadResult,
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericRelease,
  readerLockException,
  ReadResult
} from './generic-reader';
import assert from '../../stub/assert';
import { promiseRejectedWith, promiseResolvedWith, transformPromiseWith, typeIsObject } from '../helpers';
import { AsyncIteratorPrototype } from '@@target/stub/async-iterator-prototype';

export interface ReadableStreamAsyncIterator<R> extends AsyncIterator<R> {
  next(): Promise<IteratorResult<R>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export class ReadableStreamAsyncIteratorImpl<R> {
  private readonly _reader: ReadableStreamDefaultReader<R>;
  private readonly _preventCancel: boolean;

  constructor(reader: ReadableStreamDefaultReader<R>, preventCancel: boolean) {
    this._reader = reader;
    this._preventCancel = preventCancel;
  }

  next(): Promise<ReadResult<R>> {
    const reader = this._reader;
    if (reader._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('iterate'));
    }
    return transformPromiseWith(ReadableStreamDefaultReaderRead(reader), result => {
      assert(typeIsObject(result));
      const done = result.done;
      assert(typeof done === 'boolean');
      if (done) {
        ReadableStreamReaderGenericRelease(reader);
      }
      const value = result.value;
      return ReadableStreamCreateReadResult(value, done, true);
    });
  }

  return(value: any): Promise<ReadResult<any>> {
    const reader = this._reader;
    if (reader._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('finish iterating'));
    }
    if (reader._readRequests.length > 0) {
      return promiseRejectedWith(new TypeError(
        'Tried to release a reader lock when that reader has pending read() calls un-settled'));
    }
    if (this._preventCancel === false) {
      const result = ReadableStreamReaderGenericCancel(reader, value);
      ReadableStreamReaderGenericRelease(reader);
      return transformPromiseWith(result, () => ReadableStreamCreateReadResult(value, true, true));
    }
    ReadableStreamReaderGenericRelease(reader);
    return promiseResolvedWith(ReadableStreamCreateReadResult(value, true, true));
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
      return promiseRejectedWith(streamAsyncIteratorBrandCheckException('next'));
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
  const impl = new ReadableStreamAsyncIteratorImpl(reader, Boolean(preventCancel));
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
