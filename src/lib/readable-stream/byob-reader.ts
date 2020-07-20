import assert from '../../stub/assert';
import { SimpleQueue } from '../simple-queue';
import {
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericInitialize,
  ReadableStreamReaderGenericRelease,
  readerLockException,
  ReadResult
} from './generic-reader';
import { IsReadableStreamLocked, ReadableByteStream, ReadableStream } from '../readable-stream';
import {
  IsReadableByteStreamController,
  ReadableByteStreamController,
  ReadableByteStreamControllerPullInto
} from './byte-stream-controller';
import { typeIsObject } from '../helpers/miscellaneous';
import { newPromise, promiseRejectedWith } from '../helpers/webidl';
import { assertRequiredArgument } from '../validators/basic';
import { assertReadableStream } from '../validators/readable-stream';

// Abstract operations for the ReadableStream.

export function AcquireReadableStreamBYOBReader(stream: ReadableStream<Uint8Array>): ReadableStreamBYOBReader {
  return new ReadableStreamBYOBReader(stream);
}

// ReadableStream API exposed for controllers.

export function ReadableStreamAddReadIntoRequest<T extends ArrayBufferView>(stream: ReadableByteStream,
                                                                            readIntoRequest: ReadIntoRequest<T>): void {
  assert(IsReadableStreamBYOBReader(stream._reader));
  assert(stream._state === 'readable' || stream._state === 'closed');

  (stream._reader! as ReadableStreamBYOBReader)._readIntoRequests.push(readIntoRequest);
}

export function ReadableStreamFulfillReadIntoRequest(stream: ReadableByteStream,
                                                     chunk: ArrayBufferView,
                                                     done: boolean) {
  const reader = stream._reader as ReadableStreamBYOBReader;

  assert(reader._readIntoRequests.length > 0);

  const readIntoRequest = reader._readIntoRequests.shift()!;
  if (done) {
    readIntoRequest._closeSteps(chunk);
  } else {
    readIntoRequest._chunkSteps(chunk);
  }
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

export interface ReadIntoRequest<T extends ArrayBufferView> {
  _chunkSteps(chunk: T): void;

  _closeSteps(chunk: T): void;

  _errorSteps(e: any): void;
}

export class ReadableStreamBYOBReader {
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
    assertRequiredArgument(stream, 1, 'ReadableStreamBYOBReader');
    assertReadableStream(stream, 'First parameter');

    if (IsReadableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    if (!IsReadableByteStreamController(stream._readableStreamController)) {
      throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte ' +
        'source');
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

  cancel(reason: any = undefined): Promise<void> {
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

    if (!ArrayBuffer.isView(view)) {
      return promiseRejectedWith(new TypeError('view must be an array buffer view'));
    }
    if (view.byteLength === 0) {
      return promiseRejectedWith(new TypeError('view must have non-zero byteLength'));
    }
    if (view.buffer.byteLength === 0) {
      return promiseRejectedWith(new TypeError(`view's buffer must have non-zero byteLength`));
    }

    if (this._ownerReadableStream === undefined) {
      return promiseRejectedWith(readerLockException('read from'));
    }

    let resolvePromise!: (result: ReadResult<T>) => void;
    let rejectPromise!: (reason: any) => void;
    const promise = newPromise<ReadResult<T>>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const readIntoRequest: ReadIntoRequest<T> = {
      _chunkSteps: chunk => resolvePromise({ value: chunk, done: false }),
      _closeSteps: chunk => resolvePromise({ value: chunk, done: true }),
      _errorSteps: e => rejectPromise(e)
    };
    ReadableStreamBYOBReaderRead(this, view, readIntoRequest);
    return promise;
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

Object.defineProperties(ReadableStreamBYOBReader.prototype, {
  cancel: { enumerable: true },
  read: { enumerable: true },
  releaseLock: { enumerable: true },
  closed: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableStreamBYOBReader.prototype, Symbol.toStringTag, {
    value: 'ReadableStreamBYOBReader',
    configurable: true
  });
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
                                                                 view: T,
                                                                 readIntoRequest: ReadIntoRequest<T>): void {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'errored') {
    readIntoRequest._errorSteps(stream._storedError);
  } else {
    ReadableByteStreamControllerPullInto(
      stream._readableStreamController as ReadableByteStreamController,
      view,
      readIntoRequest
    );
  }
}

// Helper functions for the ReadableStreamBYOBReader.

function byobReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamBYOBReader.prototype.${name} can only be used on a ReadableStreamBYOBReader`);
}
