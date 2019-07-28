/// <reference lib="dom" />

import assert from '../stub/assert';
import {
  CreateAlgorithmFromUnderlyingMethod,
  createArrayFromList,
  InvokeOrNoop,
  IsNonNegativeNumber,
  MakeSizeAlgorithmFromSizeFunction,
  typeIsObject,
  ValidateAndNormalizeHighWaterMark
} from './helpers';
import { rethrowAssertionErrorRejection } from './utils';
import { DequeueValue, EnqueueValueWithSize, QueuePair, ResetQueue } from './queue-with-sizes';
import { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import { AcquireReadableStreamAsyncIterator, ReadableStreamAsyncIterator } from './readable-stream/async-iterator';
import {
  defaultReaderClosedPromiseReject,
  defaultReaderClosedPromiseResolve,
  ReadableStreamCreateReadResult,
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericRelease,
  readerLockException,
  ReadResult
} from './readable-stream/generic-reader';
import {
  AcquireReadableStreamDefaultReader,
  IsReadableStreamDefaultReader,
  ReadableStreamAddReadRequest,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamFulfillReadRequest,
  ReadableStreamGetNumReadRequests
} from './readable-stream/default-reader';
import { ReadableStreamPipeTo } from './readable-stream/pipe';
import { ReadableStreamTee } from './readable-stream/tee';
import { IsWritableStream, IsWritableStreamLocked, WritableStream } from './writable-stream';
import NumberIsInteger from '../stub/number-isinteger';
import { SimpleQueue } from './simple-queue';
import { noop } from '../utils';
import {
  AcquireReadableStreamBYOBReader,
  IsReadableStreamBYOBReader,
  ReadableStreamBYOBReader
} from './readable-stream/byob-reader';
import {
  ReadableByteStreamController,
  ReadableStreamBYOBRequest,
  SetUpReadableByteStreamController,
  SetUpReadableByteStreamControllerFromUnderlyingSource
} from './readable-stream/byte-stream-controller';

export const CancelSteps = Symbol('[[CancelSteps]]');
export const PullSteps = Symbol('[[PullSteps]]');

export type ReadableByteStream = ReadableStream<Uint8Array>;

export type ReadableStreamDefaultControllerCallback<R> = (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
export type ReadableByteStreamControllerCallback = (controller: ReadableByteStreamController) => void | PromiseLike<void>;
export type ReadableStreamErrorCallback = (reason: any) => void | PromiseLike<void>;

export interface UnderlyingSource<R = any> {
  start?: ReadableStreamDefaultControllerCallback<R>;
  pull?: ReadableStreamDefaultControllerCallback<R>;
  cancel?: ReadableStreamErrorCallback;
  type?: undefined;
}

export interface UnderlyingByteSource {
  start?: ReadableByteStreamControllerCallback;
  pull?: ReadableByteStreamControllerCallback;
  cancel?: ReadableStreamErrorCallback;
  type: 'bytes';
  autoAllocateChunkSize?: number;
}

export interface PipeOptions {
  preventAbort?: boolean;
  preventCancel?: boolean;
  preventClose?: boolean;
  signal?: AbortSignal;
}

export {
  ReadResult
};

type ReadableStreamState = 'readable' | 'closed' | 'errored';

class ReadableStream<R = any> {
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
  constructor(underlyingSource: UnderlyingSource<R> | UnderlyingByteSource = {}, strategy: QueuingStrategy<R> = {}) {
    InitializeReadableStream(this);

    const size = strategy.size;
    let highWaterMark = strategy.highWaterMark;

    const type = underlyingSource.type;
    const typeString = String(type);
    if (typeString === 'bytes') {
      if (size !== undefined) {
        throw new RangeError('The strategy for a byte stream cannot have a size function');
      }

      if (highWaterMark === undefined) {
        highWaterMark = 0;
      }
      highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);

      SetUpReadableByteStreamControllerFromUnderlyingSource(this as unknown as ReadableByteStream,
                                                            underlyingSource as UnderlyingByteSource,
                                                            highWaterMark);
    } else if (type === undefined) {
      const sizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(size);

      if (highWaterMark === undefined) {
        highWaterMark = 1;
      }
      highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);

      SetUpReadableStreamDefaultControllerFromUnderlyingSource(this,
                                                               underlyingSource as UnderlyingSource<R>,
                                                               highWaterMark,
                                                               sizeAlgorithm);
    } else {
      throw new RangeError('Invalid type is specified');
    }
  }

  get locked(): boolean {
    if (IsReadableStream(this) === false) {
      throw streamBrandCheckException('locked');
    }

    return IsReadableStreamLocked(this);
  }

  cancel(reason: any): Promise<void> {
    if (IsReadableStream(this) === false) {
      return Promise.reject(streamBrandCheckException('cancel'));
    }

    if (IsReadableStreamLocked(this) === true) {
      return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
    }

    return ReadableStreamCancel(this, reason);
  }

  getReader({ mode }: { mode: 'byob' }): ReadableStreamBYOBReader;
  getReader(): ReadableStreamDefaultReader<R>;
  getReader({ mode }: { mode?: 'byob' } = {}): ReadableStreamDefaultReader<R> | ReadableStreamBYOBReader {
    if (IsReadableStream(this) === false) {
      throw streamBrandCheckException('getReader');
    }

    if (mode === undefined) {
      return AcquireReadableStreamDefaultReader(this, true);
    }

    mode = String(mode) as 'byob';

    if (mode === 'byob') {
      return AcquireReadableStreamBYOBReader(this as unknown as ReadableByteStream, true);
    }

    throw new RangeError('Invalid mode is specified');
  }

  pipeThrough<T>({ writable, readable }: { writable: WritableStream<R>; readable: ReadableStream<T> },
                 { preventClose, preventAbort, preventCancel, signal }: PipeOptions = {}): ReadableStream<T> {
    if (IsReadableStream(this) === false) {
      throw streamBrandCheckException('pipeThrough');
    }

    if (IsWritableStream(writable) === false) {
      throw new TypeError('writable argument to pipeThrough must be a WritableStream');
    }

    if (IsReadableStream(readable) === false) {
      throw new TypeError('readable argument to pipeThrough must be a ReadableStream');
    }

    preventClose = Boolean(preventClose);
    preventAbort = Boolean(preventAbort);
    preventCancel = Boolean(preventCancel);

    if (signal !== undefined && !isAbortSignal(signal)) {
      throw new TypeError('ReadableStream.prototype.pipeThrough\'s signal option must be an AbortSignal');
    }

    if (IsReadableStreamLocked(this) === true) {
      throw new TypeError('ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream');
    }
    if (IsWritableStreamLocked(writable) === true) {
      throw new TypeError('ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream');
    }

    const promise = ReadableStreamPipeTo(this, writable, preventClose, preventAbort, preventCancel, signal);

    promise.catch(noop);

    return readable;
  }

  pipeTo(dest: WritableStream<R>,
         { preventClose, preventAbort, preventCancel, signal }: PipeOptions = {}): Promise<void> {
    if (IsReadableStream(this) === false) {
      return Promise.reject(streamBrandCheckException('pipeTo'));
    }
    if (IsWritableStream(dest) === false) {
      return Promise.reject(
        new TypeError('ReadableStream.prototype.pipeTo\'s first argument must be a WritableStream'));
    }

    preventClose = Boolean(preventClose);
    preventAbort = Boolean(preventAbort);
    preventCancel = Boolean(preventCancel);

    if (signal !== undefined && !isAbortSignal(signal)) {
      return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo\'s signal option must be an AbortSignal'));
    }

    if (IsReadableStreamLocked(this) === true) {
      return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream'));
    }
    if (IsWritableStreamLocked(dest) === true) {
      return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream'));
    }

    return ReadableStreamPipeTo(this, dest, preventClose, preventAbort, preventCancel, signal);
  }

  tee(): [ReadableStream<R>, ReadableStream<R>] {
    if (IsReadableStream(this) === false) {
      throw streamBrandCheckException('tee');
    }

    const branches = ReadableStreamTee(this, false);
    return createArrayFromList(branches);
  }

  getIterator({ preventCancel }: { preventCancel?: boolean } = {}): ReadableStreamAsyncIterator<R> {
    if (IsReadableStream(this) === false) {
      throw streamBrandCheckException('getIterator');
    }
    return AcquireReadableStreamAsyncIterator<R>(this, preventCancel);
  }

  [Symbol.asyncIterator]: (options?: { preventCancel?: boolean }) => ReadableStreamAsyncIterator<R>;
}

if (typeof Symbol.asyncIterator === 'symbol') {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    value: ReadableStream.prototype.getIterator,
    enumerable: false,
    writable: true,
    configurable: true
  });
}

export {
  AcquireReadableStreamDefaultReader,
  CreateReadableByteStream,
  CreateReadableStream,
  isAbortSignal,
  IsReadableStream,
  IsReadableStreamLocked,
  IsReadableStreamDisturbed,
  ReadableStream,
  ReadableStreamAsyncIterator,
  ReadableStreamCancel,
  ReadableStreamClose,
  ReadableStreamCreateReadResult,
  ReadableStreamDefaultController,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError,
  ReadableStreamDefaultControllerGetDesiredSize,
  ReadableStreamDefaultControllerHasBackpressure,
  ReadableStreamDefaultControllerCanCloseOrEnqueue,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamError,
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericRelease,
  readerLockException
};

// Abstract operations for the ReadableStream.

// Throws if and only if startAlgorithm throws.
function CreateReadableStream<R>(startAlgorithm: () => void | PromiseLike<void>,
                                 pullAlgorithm: () => Promise<void>,
                                 cancelAlgorithm: (reason: any) => Promise<void>,
                                 highWaterMark: number = 1,
                                 sizeAlgorithm: QueuingStrategySizeCallback<R> = () => 1): ReadableStream<R> {
  assert(IsNonNegativeNumber(highWaterMark) === true);

  const stream: ReadableStream<R> = Object.create(ReadableStream.prototype);
  InitializeReadableStream(stream);

  const controller: ReadableStreamDefaultController<R> = Object.create(ReadableStreamDefaultController.prototype);

  SetUpReadableStreamDefaultController(
    stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm
  );

  return stream;
}

// Throws if and only if startAlgorithm throws.
function CreateReadableByteStream(startAlgorithm: () => void | PromiseLike<void>,
                                  pullAlgorithm: () => Promise<void>,
                                  cancelAlgorithm: (reason: any) => Promise<void>,
                                  highWaterMark: number = 0,
                                  autoAllocateChunkSize: number | undefined = undefined): ReadableStream<Uint8Array> {
  assert(IsNonNegativeNumber(highWaterMark) === true);
  if (autoAllocateChunkSize !== undefined) {
    assert(NumberIsInteger(autoAllocateChunkSize) === true);
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

function IsReadableStream(x: any): x is ReadableStream {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readableStreamController')) {
    return false;
  }

  return true;
}

function IsReadableStreamDisturbed(stream: ReadableStream): boolean {
  assert(IsReadableStream(stream) === true);

  return stream._disturbed;
}

function IsReadableStreamLocked(stream: ReadableStream): boolean {
  assert(IsReadableStream(stream) === true);

  if (stream._reader === undefined) {
    return false;
  }

  return true;
}

// ReadableStream API exposed for controllers.

function ReadableStreamCancel<R>(stream: ReadableStream<R>, reason: any): Promise<void> {
  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(undefined);
  }
  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  ReadableStreamClose(stream);

  const sourceCancelPromise = stream._readableStreamController[CancelSteps](reason);
  return sourceCancelPromise.then(() => undefined);
}

function ReadableStreamClose<R>(stream: ReadableStream<R>): void {
  assert(stream._state === 'readable');

  stream._state = 'closed';

  const reader = stream._reader;

  if (reader === undefined) {
    return;
  }

  if (IsReadableStreamDefaultReader<R>(reader)) {
    reader._readRequests.forEach(readRequest => {
      readRequest._resolve(ReadableStreamCreateReadResult<R>(undefined, true, reader._forAuthorCode));
    });
    reader._readRequests = new SimpleQueue();
  }

  defaultReaderClosedPromiseResolve(reader);
}

function ReadableStreamError<R>(stream: ReadableStream<R>, e: any): void {
  assert(IsReadableStream(stream) === true);
  assert(stream._state === 'readable');

  stream._state = 'errored';
  stream._storedError = e;

  const reader = stream._reader;

  if (reader === undefined) {
    return;
  }

  if (IsReadableStreamDefaultReader<R>(reader)) {
    reader._readRequests.forEach(readRequest => {
      readRequest._reject(e);
    });

    reader._readRequests = new SimpleQueue();
  } else {
    assert(IsReadableStreamBYOBReader(reader));

    reader._readIntoRequests.forEach(readIntoRequest => {
      readIntoRequest._reject(e);
    });

    reader._readIntoRequests = new SimpleQueue();
  }

  defaultReaderClosedPromiseReject(reader, e);
}

// Readers

export type ReadableStreamReader<R> = ReadableStreamDefaultReader<R> | ReadableStreamBYOBReader;

export type ReadableStreamDefaultReaderType<R> = ReadableStreamDefaultReader<R>;

export type ReadableStreamBYOBReaderType = ReadableStreamBYOBReader;

// Abstract operations for the readers.

// Controllers

export type ReadableStreamDefaultControllerType<R> = ReadableStreamDefaultController<R>;

class ReadableStreamDefaultController<R> {
  /** @internal */
  _controlledReadableStream!: ReadableStream<R>;
  /** @internal */
  _queue!: SimpleQueue<QueuePair<R>>;
  /** @internal */
  _queueTotalSize!: number;
  /** @internal */
  _started!: boolean;
  /** @internal */
  _closeRequested!: boolean;
  /** @internal */
  _pullAgain!: boolean;
  /** @internal */
  _pulling !: boolean;
  /** @internal */
  _strategySizeAlgorithm!: QueuingStrategySizeCallback<R>;
  /** @internal */
  _strategyHWM!: number;
  /** @internal */
  _pullAlgorithm!: () => Promise<void>;
  /** @internal */
  _cancelAlgorithm!: (reason: any) => Promise<void>;

  /** @internal */
  constructor() {
    throw new TypeError();
  }

  get desiredSize(): number | null {
    if (IsReadableStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('desiredSize');
    }

    return ReadableStreamDefaultControllerGetDesiredSize(this);
  }

  close(): void {
    if (IsReadableStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('close');
    }

    if (ReadableStreamDefaultControllerCanCloseOrEnqueue(this) === false) {
      throw new TypeError('The stream is not in a state that permits close');
    }

    ReadableStreamDefaultControllerClose(this);
  }

  enqueue(chunk: R): void {
    if (IsReadableStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('enqueue');
    }

    if (ReadableStreamDefaultControllerCanCloseOrEnqueue(this) === false) {
      throw new TypeError('The stream is not in a state that permits enqueue');
    }

    return ReadableStreamDefaultControllerEnqueue(this, chunk);
  }

  error(e: any): void {
    if (IsReadableStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('error');
    }

    ReadableStreamDefaultControllerError(this, e);
  }

  /** @internal */
  [CancelSteps](reason: any): Promise<void> {
    ResetQueue(this);
    const result = this._cancelAlgorithm(reason);
    ReadableStreamDefaultControllerClearAlgorithms(this);
    return result;
  }

  /** @internal */
  [PullSteps](): Promise<ReadResult<R>> {
    const stream = this._controlledReadableStream;

    if (this._queue.length > 0) {
      const chunk = DequeueValue(this);

      if (this._closeRequested === true && this._queue.length === 0) {
        ReadableStreamDefaultControllerClearAlgorithms(this);
        ReadableStreamClose(stream);
      } else {
        ReadableStreamDefaultControllerCallPullIfNeeded(this);
      }

      return Promise.resolve(ReadableStreamCreateReadResult(chunk, false, stream._reader!._forAuthorCode));
    }

    const pendingPromise = ReadableStreamAddReadRequest(stream);
    ReadableStreamDefaultControllerCallPullIfNeeded(this);
    return pendingPromise;
  }
}

// Abstract operations for the ReadableStreamDefaultController.

function IsReadableStreamDefaultController<R>(x: any): x is ReadableStreamDefaultController<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableStream')) {
    return false;
  }

  return true;
}

function ReadableStreamDefaultControllerCallPullIfNeeded(controller: ReadableStreamDefaultController<any>): void {
  const shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return;
  }

  assert(controller._pullAgain === false);

  controller._pulling = true;

  const pullPromise = controller._pullAlgorithm();
  pullPromise.then(
    () => {
      controller._pulling = false;

      if (controller._pullAgain === true) {
        controller._pullAgain = false;
        ReadableStreamDefaultControllerCallPullIfNeeded(controller);
      }
    },
    e => {
      ReadableStreamDefaultControllerError(controller, e);
    }
  ).catch(rethrowAssertionErrorRejection);
}

function ReadableStreamDefaultControllerShouldCallPull(controller: ReadableStreamDefaultController<any>): boolean {
  const stream = controller._controlledReadableStream;

  if (ReadableStreamDefaultControllerCanCloseOrEnqueue(controller) === false) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (IsReadableStreamLocked(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  const desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
  assert(desiredSize !== null);
  if (desiredSize! > 0) {
    return true;
  }

  return false;
}

function ReadableStreamDefaultControllerClearAlgorithms(controller: ReadableStreamDefaultController<any>) {
  controller._pullAlgorithm = undefined!;
  controller._cancelAlgorithm = undefined!;
  controller._strategySizeAlgorithm = undefined!;
}

// A client of ReadableStreamDefaultController may use these functions directly to bypass state check.

function ReadableStreamDefaultControllerClose(controller: ReadableStreamDefaultController<any>) {
  const stream = controller._controlledReadableStream;

  assert(ReadableStreamDefaultControllerCanCloseOrEnqueue(controller) === true);

  controller._closeRequested = true;

  if (controller._queue.length === 0) {
    ReadableStreamDefaultControllerClearAlgorithms(controller);
    ReadableStreamClose(stream);
  }
}

function ReadableStreamDefaultControllerEnqueue<R>(controller: ReadableStreamDefaultController<R>, chunk: R): void {
  const stream = controller._controlledReadableStream;

  assert(ReadableStreamDefaultControllerCanCloseOrEnqueue(controller) === true);

  if (IsReadableStreamLocked(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    ReadableStreamFulfillReadRequest(stream, chunk, false);
  } else {
    let chunkSize;
    try {
      chunkSize = controller._strategySizeAlgorithm(chunk);
    } catch (chunkSizeE) {
      ReadableStreamDefaultControllerError(controller, chunkSizeE);
      throw chunkSizeE;
    }

    try {
      EnqueueValueWithSize(controller, chunk, chunkSize);
    } catch (enqueueE) {
      ReadableStreamDefaultControllerError(controller, enqueueE);
      throw enqueueE;
    }
  }

  ReadableStreamDefaultControllerCallPullIfNeeded(controller);
}

function ReadableStreamDefaultControllerError(controller: ReadableStreamDefaultController<any>, e: any) {
  const stream = controller._controlledReadableStream;

  if (stream._state !== 'readable') {
    return;
  }

  ResetQueue(controller);

  ReadableStreamDefaultControllerClearAlgorithms(controller);
  ReadableStreamError(stream, e);
}

function ReadableStreamDefaultControllerGetDesiredSize(controller: ReadableStreamDefaultController<any>): number | null {
  const stream = controller._controlledReadableStream;
  const state = stream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

// This is used in the implementation of TransformStream.
function ReadableStreamDefaultControllerHasBackpressure(controller: ReadableStreamDefaultController<any>): boolean {
  if (ReadableStreamDefaultControllerShouldCallPull(controller) === true) {
    return false;
  }

  return true;
}

function ReadableStreamDefaultControllerCanCloseOrEnqueue(controller: ReadableStreamDefaultController<any>): boolean {
  const state = controller._controlledReadableStream._state;

  if (controller._closeRequested === false && state === 'readable') {
    return true;
  }

  return false;
}

function SetUpReadableStreamDefaultController<R>(stream: ReadableStream<R>,
                                                 controller: ReadableStreamDefaultController<R>,
                                                 startAlgorithm: () => void | PromiseLike<void>,
                                                 pullAlgorithm: () => Promise<void>,
                                                 cancelAlgorithm: (reason: any) => Promise<void>,
                                                 highWaterMark: number,
                                                 sizeAlgorithm: QueuingStrategySizeCallback<R>) {
  assert(stream._readableStreamController === undefined);

  controller._controlledReadableStream = stream;

  controller._queue = undefined!;
  controller._queueTotalSize = undefined!;
  ResetQueue(controller);

  controller._started = false;
  controller._closeRequested = false;
  controller._pullAgain = false;
  controller._pulling = false;

  controller._strategySizeAlgorithm = sizeAlgorithm;
  controller._strategyHWM = highWaterMark;

  controller._pullAlgorithm = pullAlgorithm;
  controller._cancelAlgorithm = cancelAlgorithm;

  stream._readableStreamController = controller;

  const startResult = startAlgorithm();
  Promise.resolve(startResult).then(
    () => {
      controller._started = true;

      assert(controller._pulling === false);
      assert(controller._pullAgain === false);

      ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    },
    r => {
      ReadableStreamDefaultControllerError(controller, r);
    }
  ).catch(rethrowAssertionErrorRejection);
}

function SetUpReadableStreamDefaultControllerFromUnderlyingSource<R>(stream: ReadableStream<R>,
                                                                     underlyingSource: UnderlyingSource<R>,
                                                                     highWaterMark: number,
                                                                     sizeAlgorithm: QueuingStrategySizeCallback<R>) {
  assert(underlyingSource !== undefined);

  const controller: ReadableStreamDefaultController<R> = Object.create(ReadableStreamDefaultController.prototype);

  function startAlgorithm() {
    return InvokeOrNoop<typeof underlyingSource, 'start'>(underlyingSource, 'start', [controller]);
  }

  const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof underlyingSource, 'pull'>(
    underlyingSource, 'pull', 0, [controller]
  );
  const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof underlyingSource, 'cancel'>(
    underlyingSource, 'cancel', 1, []
  );

  SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm,
                                       highWaterMark, sizeAlgorithm);
}

export type ReadableStreamBYOBRequestType = ReadableStreamBYOBRequest;

export type ReadableByteStreamControllerType = ReadableByteStreamController;

// Helper functions for the ReadableStream.

function isAbortSignal(value: any): value is AbortSignal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Use the brand check to distinguish a real AbortSignal from a fake one.
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
  try {
    aborted.call(value);
    return true;
  } catch (e) {
    return false;
  }
}

function streamBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStream.prototype.${name} can only be used on a ReadableStream`);
}

// Helper functions for the ReadableStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamDefaultController.prototype.${name} can only be used on a ReadableStreamDefaultController`);
}
