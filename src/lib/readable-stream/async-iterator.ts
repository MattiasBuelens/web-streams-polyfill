import {
  ReadableStreamCreateReadResult,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericRelease,
  readerLockException
} from '../readable-stream';
import assert from '../../stub/assert';
import { typeIsObject } from '../helpers';
import { AsyncIteratorPrototype } from '@@target/stub/async-iterator-prototype';

export interface ReadableStreamAsyncIterator<R> extends AsyncIterator<R> {
  next(): Promise<IteratorResult<R>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export declare class ReadableStreamAsyncIteratorImpl<R> implements ReadableStreamAsyncIterator<R> {
  /** @internal */
  _asyncIteratorReader: ReadableStreamDefaultReader<R>;
  /** @internal */
  _preventCancel: boolean;

  next(): Promise<IteratorResult<R>>;

  return(value?: any): Promise<IteratorResult<any>>;
}

export const ReadableStreamAsyncIteratorPrototype: ReadableStreamAsyncIteratorImpl<any> = {
  next(): Promise<IteratorResult<any>> {
    if (IsReadableStreamAsyncIterator(this) === false) {
      return Promise.reject(streamAsyncIteratorBrandCheckException('next'));
    }
    const reader = this._asyncIteratorReader;
    if (reader._ownerReadableStream === undefined) {
      return Promise.reject(readerLockException('iterate'));
    }
    return ReadableStreamDefaultReaderRead(reader).then(result => {
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

  return(value: any): Promise<IteratorResult<any>> {
    if (IsReadableStreamAsyncIterator(this) === false) {
      return Promise.reject(streamAsyncIteratorBrandCheckException('next'));
    }
    const reader = this._asyncIteratorReader;
    if (reader._ownerReadableStream === undefined) {
      return Promise.reject(readerLockException('finish iterating'));
    }
    if (reader._readRequests.length > 0) {
      return Promise.reject(new TypeError(
        'Tried to release a reader lock when that reader has pending read() calls un-settled'));
    }
    if (this._preventCancel === false) {
      const result = ReadableStreamReaderGenericCancel(reader, value);
      ReadableStreamReaderGenericRelease(reader);
      return result.then(() => ReadableStreamCreateReadResult(value, true, true));
    }
    ReadableStreamReaderGenericRelease(reader);
    return Promise.resolve(ReadableStreamCreateReadResult(value, true, true));
  }
} as any;
if (AsyncIteratorPrototype !== undefined) {
  Object.setPrototypeOf(ReadableStreamAsyncIteratorPrototype, AsyncIteratorPrototype);
}
Object.defineProperty(ReadableStreamAsyncIteratorPrototype, 'next', { enumerable: false });
Object.defineProperty(ReadableStreamAsyncIteratorPrototype, 'return', { enumerable: false });

// Abstract operations for the ReadableStream.

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
