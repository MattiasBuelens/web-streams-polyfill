import { IsDetachedBuffer, newPromise, promiseRejectedWith, typeIsObject } from '../helpers';
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
import { IsReadableStream, IsReadableStreamLocked, ReadableByteStream, ReadableStream } from '../readable-stream';
import {
  IsReadableByteStreamController,
  ReadableByteStreamController,
  ReadableByteStreamControllerPullInto
} from './byte-stream-controller';

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamBYOBReader(stream: ReadableStream<Uint8Array>,
                                                forAuthorCode: boolean = false): ReadableStreamBYOBReader {
  const reader = new ReadableStreamBYOBReader(stream);
  reader._forAuthorCode = forAuthorCode;
  return reader;
}

// ReadableStream API exposed for controllers.

export function ReadableStreamAddReadIntoRequest<T extends ArrayBufferView>(stream: ReadableByteStream): Promise<ReadResult<T>> {
  assert(IsReadableStreamBYOBReader(stream._reader) === true);
  assert(stream._state === 'readable' || stream._state === 'closed');

  const promise = newPromise<ReadResult<T>>((resolve, reject) => {
    const readIntoRequest: ReadIntoRequest<T> = {
      _resolve: resolve,
      _reject: reject
    };

    (stream._reader! as ReadableStreamBYOBReader)._readIntoRequests.push(readIntoRequest);
  });

  return promise;
}

export function ReadableStreamFulfillReadIntoRequest(stream: ReadableByteStream,
                                                     chunk: ArrayBufferView,
                                                     done: boolean) {
  const reader = stream._reader as ReadableStreamBYOBReader;

  assert(reader._readIntoRequests.length > 0);

  const readIntoRequest = reader._readIntoRequests.shift()!;
  readIntoRequest._resolve(ReadableStreamCreateReadResult(chunk, done, reader._forAuthorCode));
}

export function ReadableStreamGetNumReadIntoRequests(stream: ReadableByteStream): number {
  return (stream._reader as ReadableStreamBYOBReader)._readIntoRequests.length;
}

export function ReadableStreamHasBYOBReader(stream: ReadableByteStream): boolean {
  const reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (!IsReadableStreamBYOBReader(reader)) {
    return false;
  }

  return true;
}

// Readers

interface ReadIntoRequest<T extends ArrayBufferView> {
  _resolve: (value: ReadResult<T>) => void;
  _reject: (reason: any) => void;
}

export type ReadableStreamBYOBReaderType = ReadableStreamBYOBReader;

export class ReadableStreamBYOBReader {
  /** @internal */
  _forAuthorCode!: boolean;
  /** @internal */
  _ownerReadableStream!: ReadableByteStream;
  /** @internal */
  _closedPromise!: Promise<void>;
  /** @internal */
  _closedPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _closedPromise_reject?: (reason: any) => void;
  /** @internal */
  _readIntoRequests: SimpleQueue<ReadIntoRequest<any>>;

  constructor(stream: ReadableByteStream) {
    if (!IsReadableStream(stream)) {
      throw new TypeError('ReadableStreamBYOBReader can only be constructed with a ReadableStream instance given a ' +
        'byte source');
    }
    if (IsReadableByteStreamController(stream._readableStreamController) === false) {
      throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte ' +
        'source');
    }
    if (IsReadableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readIntoRequests = new SimpleQueue();
  }

  get closed(): Promise<void> {
    if (!IsReadableStreamBYOBReader(this)) {
      return promiseRejectedWith(byobReaderBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  cancel(reason: any): Promise<void> {
    if (!IsReadableStreamBYOBReader(this)) {
      return promiseRejectedWith(byobReaderBrandCheckException('cancel'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('cancel'));
    }

    return ReadableStreamReaderGenericCancel(this, reason);
  }

  read<T extends ArrayBufferView>(view: T): Promise<ReadResult<T>> {
    if (!IsReadableStreamBYOBReader(this)) {
      return promiseRejectedWith(byobReaderBrandCheckException('read'));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('read from'));
    }

    if (!ArrayBuffer.isView(view)) {
      return promiseRejectedWith(new TypeError('view must be an array buffer view'));
    }

    if (IsDetachedBuffer(view.buffer) === true) {
      return promiseRejectedWith(new TypeError('Cannot read into a view onto a detached ArrayBuffer'));
    }

    if (view.byteLength === 0) {
      return promiseRejectedWith(new TypeError('view must have non-zero byteLength'));
    }

    return ReadableStreamBYOBReaderRead(this, view);
  }

  releaseLock(): void {
    if (!IsReadableStreamBYOBReader(this)) {
      throw byobReaderBrandCheckException('releaseLock');
    }

    if (this._ownerReadableStream === undefined) {
      return;
    }

    if (this._readIntoRequests.length > 0) {
      throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
    }

    ReadableStreamReaderGenericRelease(this);
  }
}

// Abstract operations for the readers.

export function IsReadableStreamBYOBReader(x: any): x is ReadableStreamBYOBReader {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
    return false;
  }

  return true;
}

function ReadableStreamBYOBReaderRead<T extends ArrayBufferView>(reader: ReadableStreamBYOBReader,
                                                                 view: T): Promise<ReadResult<T>> {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'errored') {
    return promiseRejectedWith(stream._storedError);
  }

  // Controllers must implement this.
  return ReadableByteStreamControllerPullInto(stream._readableStreamController as ReadableByteStreamController,
                                              view);
}

// Helper functions for the ReadableStreamBYOBReader.

function byobReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamBYOBReader.prototype.${name} can only be used on a ReadableStreamBYOBReader`);
}
