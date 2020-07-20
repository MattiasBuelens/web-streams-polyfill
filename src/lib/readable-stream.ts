import assert from '../stub/assert';
import {
  promiseRejectedWith,
  promiseResolvedWith,
  setPromiseIsHandledToTrue,
  transformPromiseWith
} from './helpers/webidl';
import { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import { AcquireReadableStreamAsyncIterator, ReadableStreamAsyncIterator } from './readable-stream/async-iterator';
import { defaultReaderClosedPromiseReject, defaultReaderClosedPromiseResolve } from './readable-stream/generic-reader';
import {
  AcquireReadableStreamDefaultReader,
  IsReadableStreamDefaultReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReadResult
} from './readable-stream/default-reader';
import {
  AcquireReadableStreamBYOBReader,
  IsReadableStreamBYOBReader,
  ReadableStreamBYOBReader,
  ReadableStreamBYOBReadResult
} from './readable-stream/byob-reader';
import { ReadableStreamPipeTo } from './readable-stream/pipe';
import { ReadableStreamTee } from './readable-stream/tee';
import { IsWritableStream, IsWritableStreamLocked, WritableStream } from './writable-stream';
import NumberIsInteger from '../stub/number-isinteger';
import { SimpleQueue } from './simple-queue';
import {
  ReadableByteStreamController,
  ReadableStreamBYOBRequest,
  SetUpReadableByteStreamController,
  SetUpReadableByteStreamControllerFromUnderlyingSource
} from './readable-stream/byte-stream-controller';
import {
  ReadableStreamDefaultController,
  SetUpReadableStreamDefaultController,
  SetUpReadableStreamDefaultControllerFromUnderlyingSource
} from './readable-stream/default-controller';
import {
  UnderlyingByteSource,
  UnderlyingByteSourcePullCallback,
  UnderlyingByteSourceStartCallback,
  UnderlyingSource,
  UnderlyingSourceCancelCallback,
  UnderlyingSourcePullCallback,
  UnderlyingSourceStartCallback
} from './readable-stream/underlying-source';
import { noop } from '../utils';
import { typeIsObject } from './helpers/miscellaneous';
import { CreateArrayFromList } from './abstract-ops/ecmascript';
import { CancelSteps } from './abstract-ops/internal-methods';
import { IsNonNegativeNumber } from './abstract-ops/miscellaneous';
import { assertObject, assertRequiredArgument } from './validators/basic';
import { convertQueuingStrategy } from './validators/queuing-strategy';
import { ExtractHighWaterMark, ExtractSizeAlgorithm } from './abstract-ops/queuing-strategy';
import { convertUnderlyingDefaultOrByteSource } from './validators/underlying-source';
import { ReadableStreamGetReaderOptions } from './readable-stream/reader-options';
import { convertReaderOptions } from './validators/reader-options';
import { StreamPipeOptions, ValidatedStreamPipeOptions } from './readable-stream/pipe-options';
import { ReadableStreamIteratorOptions } from './readable-stream/iterator-options';
import { convertIteratorOptions } from './validators/iterator-options';
import { convertPipeOptions } from './validators/pipe-options';
import { ReadableWritablePair } from './readable-stream/readable-writable-pair';
import { convertReadableWritablePair } from './validators/readable-writable-pair';

export type ReadableByteStream = ReadableStream<Uint8Array>;

type ReadableStreamState = 'readable' | 'closed' | 'errored';

export class ReadableStream<R = any> {
  /** @internal */
  _state!: ReadableStreamState;
  /** @internal */
  _reader: ReadableStreamReader<R> | undefined;
  /** @internal */
  _storedError: any;
  /** @internal */
  _disturbed!: boolean;
  /** @internal */
  _readableStreamController!: ReadableStreamDefaultController<R> | ReadableByteStreamController;

  constructor(underlyingSource: UnderlyingByteSource, strategy?: { highWaterMark?: number; size?: undefined });
  constructor(underlyingSource?: UnderlyingSource<R>, strategy?: QueuingStrategy<R>);
  constructor(rawUnderlyingSource: UnderlyingSource<R> | UnderlyingByteSource | null | undefined = {},
              rawStrategy: QueuingStrategy<R> | null | undefined = {}) {
    if (rawUnderlyingSource === undefined) {
      rawUnderlyingSource = null;
    } else {
      assertObject(rawUnderlyingSource, 'First parameter');
    }

    const strategy = convertQueuingStrategy(rawStrategy, 'Second parameter');
    const underlyingSource = convertUnderlyingDefaultOrByteSource(rawUnderlyingSource, 'First parameter');

    InitializeReadableStream(this);

    if (underlyingSource.type === 'bytes') {
      if (strategy.size !== undefined) {
        throw new RangeError('The strategy for a byte stream cannot have a size function');
      }
      const highWaterMark = ExtractHighWaterMark(strategy, 0);
      SetUpReadableByteStreamControllerFromUnderlyingSource(
        this as unknown as ReadableByteStream,
        underlyingSource,
        highWaterMark
      );
    } else {
      assert(underlyingSource.type === undefined);
      const sizeAlgorithm = ExtractSizeAlgorithm(strategy);
      const highWaterMark = ExtractHighWaterMark(strategy, 1);
      SetUpReadableStreamDefaultControllerFromUnderlyingSource(
        this,
        underlyingSource,
        highWaterMark,
        sizeAlgorithm
      );
    }
  }

  get locked(): boolean {
    if (!IsReadableStream(this)) {
      throw streamBrandCheckException('locked');
    }

    return IsReadableStreamLocked(this);
  }

  cancel(reason: any = undefined): Promise<void> {
    if (!IsReadableStream(this)) {
      return promiseRejectedWith(streamBrandCheckException('cancel'));
    }

    if (IsReadableStreamLocked(this)) {
      return promiseRejectedWith(new TypeError('Cannot cancel a stream that already has a reader'));
    }

    return ReadableStreamCancel(this, reason);
  }

  getReader({ mode }: { mode: 'byob' }): ReadableStreamBYOBReader;
  getReader(): ReadableStreamDefaultReader<R>;
  getReader(
    rawOptions: ReadableStreamGetReaderOptions | null | undefined = undefined
  ): ReadableStreamDefaultReader<R> | ReadableStreamBYOBReader {
    if (!IsReadableStream(this)) {
      throw streamBrandCheckException('getReader');
    }

    const options = convertReaderOptions(rawOptions, 'First parameter');

    if (options.mode === undefined) {
      return AcquireReadableStreamDefaultReader(this);
    }

    assert(options.mode === 'byob');
    return AcquireReadableStreamBYOBReader(this as unknown as ReadableByteStream);
  }

  pipeThrough<T>(transform: ReadableWritablePair<T, R>, options?: StreamPipeOptions): ReadableStream<T>;
  pipeThrough<T>(rawTransform: ReadableWritablePair<T, R> | null | undefined,
                 rawOptions: StreamPipeOptions | null | undefined = {}): ReadableStream<T> {
    if (!IsReadableStream(this)) {
      throw streamBrandCheckException('pipeThrough');
    }
    assertRequiredArgument(rawTransform, 1, 'pipeThrough');

    const transform = convertReadableWritablePair(rawTransform, 'First parameter');
    const options = convertPipeOptions(rawOptions, 'Second parameter');

    if (IsReadableStreamLocked(this)) {
      throw new TypeError('ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream');
    }
    if (IsWritableStreamLocked(transform.writable)) {
      throw new TypeError('ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream');
    }

    const promise = ReadableStreamPipeTo(
      this, transform.writable, options.preventClose, options.preventAbort, options.preventCancel, options.signal
    );

    setPromiseIsHandledToTrue(promise);

    return transform.readable;
  }

  pipeTo(destination: WritableStream<R>, options?: StreamPipeOptions): Promise<void>;
  pipeTo(destination: WritableStream<R> | null | undefined,
         rawOptions: StreamPipeOptions | null | undefined = {}): Promise<void> {
    if (!IsReadableStream(this)) {
      return promiseRejectedWith(streamBrandCheckException('pipeTo'));
    }

    if (destination === undefined) {
      return promiseRejectedWith(`Parameter 1 is required in 'pipeTo'.`);
    }
    if (!IsWritableStream(destination)) {
      return promiseRejectedWith(
        new TypeError(`ReadableStream.prototype.pipeTo's first argument must be a WritableStream`)
      );
    }

    let options: ValidatedStreamPipeOptions;
    try {
      options = convertPipeOptions(rawOptions, 'Second parameter');
    } catch (e) {
      return promiseRejectedWith(e);
    }

    if (IsReadableStreamLocked(this)) {
      return promiseRejectedWith(
        new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream')
      );
    }
    if (IsWritableStreamLocked(destination)) {
      return promiseRejectedWith(
        new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream')
      );
    }

    return ReadableStreamPipeTo<R>(
      this, destination, options.preventClose, options.preventAbort, options.preventCancel, options.signal
    );
  }

  tee(): [ReadableStream<R>, ReadableStream<R>] {
    if (!IsReadableStream(this)) {
      throw streamBrandCheckException('tee');
    }

    const branches = ReadableStreamTee(this, false);
    return CreateArrayFromList(branches);
  }

  values(options?: ReadableStreamIteratorOptions): ReadableStreamAsyncIterator<R>;
  values(rawOptions: ReadableStreamIteratorOptions | null | undefined = undefined): ReadableStreamAsyncIterator<R> {
    if (!IsReadableStream(this)) {
      throw streamBrandCheckException('values');
    }

    const options = convertIteratorOptions(rawOptions, 'First parameter');
    return AcquireReadableStreamAsyncIterator<R>(this, options.preventCancel);
  }

  [Symbol.asyncIterator]: (options?: ReadableStreamIteratorOptions) => ReadableStreamAsyncIterator<R>;
}

Object.defineProperties(ReadableStream.prototype, {
  cancel: { enumerable: true },
  getReader: { enumerable: true },
  pipeThrough: { enumerable: true },
  pipeTo: { enumerable: true },
  tee: { enumerable: true },
  values: { enumerable: true },
  locked: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableStream.prototype, Symbol.toStringTag, {
    value: 'ReadableStream',
    configurable: true
  });
}
if (typeof Symbol.asyncIterator === 'symbol') {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    value: ReadableStream.prototype.values,
    writable: true,
    configurable: true
  });
}

export {
  ReadableStreamAsyncIterator,
  ReadableStreamDefaultReadResult,
  ReadableStreamBYOBReadResult,
  UnderlyingByteSource,
  UnderlyingSource,
  UnderlyingSourceStartCallback,
  UnderlyingSourcePullCallback,
  UnderlyingSourceCancelCallback,
  UnderlyingByteSourceStartCallback,
  UnderlyingByteSourcePullCallback,
  StreamPipeOptions,
  ReadableWritablePair,
  ReadableStreamIteratorOptions
};

// Abstract operations for the ReadableStream.

// Throws if and only if startAlgorithm throws.
export function CreateReadableStream<R>(startAlgorithm: () => void | PromiseLike<void>,
                                        pullAlgorithm: () => Promise<void>,
                                        cancelAlgorithm: (reason: any) => Promise<void>,
                                        highWaterMark = 1,
                                        sizeAlgorithm: QueuingStrategySizeCallback<R> = () => 1): ReadableStream<R> {
  assert(IsNonNegativeNumber(highWaterMark));

  const stream: ReadableStream<R> = Object.create(ReadableStream.prototype);
  InitializeReadableStream(stream);

  const controller: ReadableStreamDefaultController<R> = Object.create(ReadableStreamDefaultController.prototype);
  SetUpReadableStreamDefaultController(
    stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm
  );

  return stream;
}

// Throws if and only if startAlgorithm throws.
export function CreateReadableByteStream(startAlgorithm: () => void | PromiseLike<void>,
                                         pullAlgorithm: () => Promise<void>,
                                         cancelAlgorithm: (reason: any) => Promise<void>,
                                         highWaterMark = 0,
                                         autoAllocateChunkSize: number | undefined = undefined): ReadableStream<Uint8Array> {
  assert(IsNonNegativeNumber(highWaterMark));
  if (autoAllocateChunkSize !== undefined) {
    assert(NumberIsInteger(autoAllocateChunkSize));
    assert(autoAllocateChunkSize > 0);
  }

  const stream: ReadableStream<Uint8Array> = Object.create(ReadableStream.prototype);
  InitializeReadableStream(stream);

  const controller: ReadableByteStreamController = Object.create(ReadableByteStreamController.prototype);

  SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark,
                                    autoAllocateChunkSize);

  return stream;
}

function InitializeReadableStream(stream: ReadableStream) {
  stream._state = 'readable';
  stream._reader = undefined;
  stream._storedError = undefined;
  stream._disturbed = false;
}

export function IsReadableStream(x: unknown): x is ReadableStream {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readableStreamController')) {
    return false;
  }

  return true;
}

export function IsReadableStreamDisturbed(stream: ReadableStream): boolean {
  assert(IsReadableStream(stream));

  return stream._disturbed;
}

export function IsReadableStreamLocked(stream: ReadableStream): boolean {
  assert(IsReadableStream(stream));

  if (stream._reader === undefined) {
    return false;
  }

  return true;
}

// ReadableStream API exposed for controllers.

export function ReadableStreamCancel<R>(stream: ReadableStream<R>, reason: any): Promise<void> {
  stream._disturbed = true;

  if (stream._state === 'closed') {
    return promiseResolvedWith(undefined);
  }
  if (stream._state === 'errored') {
    return promiseRejectedWith(stream._storedError);
  }

  ReadableStreamClose(stream);

  const sourceCancelPromise = stream._readableStreamController[CancelSteps](reason);
  return transformPromiseWith(sourceCancelPromise, noop);
}

export function ReadableStreamClose<R>(stream: ReadableStream<R>): void {
  assert(stream._state === 'readable');

  stream._state = 'closed';

  const reader = stream._reader;

  if (reader === undefined) {
    return;
  }

  if (IsReadableStreamDefaultReader<R>(reader)) {
    reader._readRequests.forEach(readRequest => {
      readRequest._closeSteps();
    });
    reader._readRequests = new SimpleQueue();
  }

  defaultReaderClosedPromiseResolve(reader);
}

export function ReadableStreamError<R>(stream: ReadableStream<R>, e: any): void {
  assert(IsReadableStream(stream));
  assert(stream._state === 'readable');

  stream._state = 'errored';
  stream._storedError = e;

  const reader = stream._reader;

  if (reader === undefined) {
    return;
  }

  if (IsReadableStreamDefaultReader<R>(reader)) {
    reader._readRequests.forEach(readRequest => {
      readRequest._errorSteps(e);
    });

    reader._readRequests = new SimpleQueue();
  } else {
    assert(IsReadableStreamBYOBReader(reader));

    reader._readIntoRequests.forEach(readIntoRequest => {
      readIntoRequest._errorSteps(e);
    });

    reader._readIntoRequests = new SimpleQueue();
  }

  defaultReaderClosedPromiseReject(reader, e);
}

// Readers

export type ReadableStreamReader<R> = ReadableStreamDefaultReader<R> | ReadableStreamBYOBReader;

export {
  ReadableStreamDefaultReader,
  ReadableStreamBYOBReader
};

// Controllers

export {
  ReadableStreamDefaultController,
  ReadableStreamBYOBRequest,
  ReadableByteStreamController
};

// Helper functions for the ReadableStream.

function streamBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStream.prototype.${name} can only be used on a ReadableStream`);
}
