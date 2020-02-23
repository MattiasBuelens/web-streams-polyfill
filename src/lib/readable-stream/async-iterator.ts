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

declare class ReadableStreamAsyncIteratorImpl<R> implements ReadableStreamAsyncIterator<R> {
  /** @internal */
  _asyncIteratorReader: ReadableStreamDefaultReader<R>;
  /** @internal */
  _preventCancel: boolean;

  next(): Promise<IteratorResult<R>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

const ReadableStreamAsyncIteratorPrototype: ReadableStreamAsyncIteratorImpl<any> = {
  next(this: ReadableStreamAsyncIteratorImpl<any>): Promise<ReadResult<any>> {
    if (IsReadableStreamAsyncIterator(this) === false) {
      return promiseRejectedWith(streamAsyncIteratorBrandCheckException('next'));
    }
    const reader = this._asyncIteratorReader;
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
  },

  return(this: ReadableStreamAsyncIteratorImpl<any>, value: any): Promise<ReadResult<any>> {
    if (IsReadableStreamAsyncIterator(this) === false) {
      return promiseRejectedWith(streamAsyncIteratorBrandCheckException('next'));
    }
    const reader = this._asyncIteratorReader;
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
} as any;
if (AsyncIteratorPrototype !== undefined) {
  Object.setPrototypeOf(ReadableStreamAsyncIteratorPrototype, AsyncIteratorPrototype);
}
Object.defineProperty(ReadableStreamAsyncIteratorPrototype, 'next', { enumerable: false });
Object.defineProperty(ReadableStreamAsyncIteratorPrototype, 'return', { enumerable: false });

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamAsyncIterator<R>(stream: ReadableStream<R>,
                                                      preventCancel = false): ReadableStreamAsyncIterator<R> {
  const reader = AcquireReadableStreamDefaultReader<R>(stream);
  const iterator: ReadableStreamAsyncIteratorImpl<R> = Object.create(ReadableStreamAsyncIteratorPrototype);
  iterator._asyncIteratorReader = reader;
  iterator._preventCancel = Boolean(preventCancel);
  return iterator;
}

function IsReadableStreamAsyncIterator<R>(x: any): x is ReadableStreamAsyncIterator<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_asyncIteratorReader')) {
    return false;
  }

  return true;
}

// Helper functions for the ReadableStream.

function streamAsyncIteratorBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
}
