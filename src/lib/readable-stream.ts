/// <reference lib="dom" />
/* global AbortSignal:false */

import assert from '../stub/assert';
import {
  ArrayBufferCopy,
  CreateAlgorithmFromUnderlyingMethod,
  createArrayFromList,
  InvokeOrNoop,
  IsDetachedBuffer,
  IsFiniteNonNegativeNumber,
  IsNonNegativeNumber,
  MakeSizeAlgorithmFromSizeFunction,
  TransferArrayBuffer,
  typeIsObject,
  ValidateAndNormalizeHighWaterMark,
  WaitForAllPromise
} from './helpers';
import { rethrowAssertionErrorRejection } from './utils';
import { DequeueValue, EnqueueValueWithSize, QueuePair, ResetQueue } from './queue-with-sizes';
import { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import {
  AcquireWritableStreamDefaultWriter,
  IsWritableStream,
  IsWritableStreamLocked,
  WritableStream,
  WritableStreamAbort,
  WritableStreamCloseQueuedOrInFlight,
  WritableStreamDefaultWriterCloseWithErrorPropagation,
  WritableStreamDefaultWriterRelease,
  WritableStreamDefaultWriterWrite
} from './writable-stream';
import NumberIsInteger from '../stub/number-isinteger';
import { AsyncIteratorPrototype } from '@@target/stub/async-iterator-prototype';

const CancelSteps = Symbol('[[CancelSteps]]');
const PullSteps = Symbol('[[PullSteps]]');

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

// TODO Fix ReadableStreamReadResult<R> in TypeScript DOM types
export interface ReadResult<T = any> {
  done: boolean;
  value: T;
}

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

    promise.catch(() => {});

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
    const reader = AcquireReadableStreamDefaultReader<R>(this);
    const iterator: ReadableStreamAsyncIteratorImpl<R> = Object.create(ReadableStreamAsyncIteratorPrototype);
    iterator._asyncIteratorReader = reader;
    iterator._preventCancel = Boolean(preventCancel);
    return iterator;
  }

  [Symbol.asyncIterator]: (options?: { preventCancel?: boolean }) => ReadableStreamAsyncIterator<R>;
}

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

if (typeof Symbol.asyncIterator === 'symbol') {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    value: ReadableStream.prototype.getIterator,
    enumerable: false,
    writable: true,
    configurable: true
  });
}

export {
  CreateReadableByteStream,
  CreateReadableStream,
  ReadableStream,
  IsReadableStreamDisturbed,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError,
  ReadableStreamDefaultControllerGetDesiredSize,
  ReadableStreamDefaultControllerHasBackpressure,
  ReadableStreamDefaultControllerCanCloseOrEnqueue
};

// Abstract operations for the ReadableStream.

function AcquireReadableStreamBYOBReader(stream: ReadableStream<Uint8Array>,
                                         forAuthorCode: boolean = false): ReadableStreamBYOBReader {
  const reader = new ReadableStreamBYOBReader(stream);
  reader._forAuthorCode = forAuthorCode;
  return reader;
}

function AcquireReadableStreamDefaultReader<R>(stream: ReadableStream,
                                               forAuthorCode: boolean = false): ReadableStreamDefaultReader<R> {
  const reader = new ReadableStreamDefaultReader(stream);
  reader._forAuthorCode = forAuthorCode;
  return reader;
}

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

function IsReadableStreamAsyncIterator<R>(x: any): x is ReadableStreamAsyncIterator<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_asyncIteratorReader')) {
    return false;
  }

  return true;
}

function ReadableStreamPipeTo<T>(source: ReadableStream<T>,
                                 dest: WritableStream<T>,
                                 preventClose: boolean,
                                 preventAbort: boolean,
                                 preventCancel: boolean,
                                 signal: AbortSignal | undefined): Promise<void> {
  assert(IsReadableStream(source) === true);
  assert(IsWritableStream(dest) === true);
  assert(typeof preventClose === 'boolean');
  assert(typeof preventAbort === 'boolean');
  assert(typeof preventCancel === 'boolean');
  assert(signal === undefined || isAbortSignal(signal));
  assert(IsReadableStreamLocked(source) === false);
  assert(IsWritableStreamLocked(dest) === false);

  const reader = AcquireReadableStreamDefaultReader<T>(source);
  const writer = AcquireWritableStreamDefaultWriter<T>(dest);

  let shuttingDown = false;

  // This is used to keep track of the spec's requirement that we wait for ongoing writes during shutdown.
  let currentWrite = Promise.resolve();

  return new Promise((resolve, reject) => {
    let abortAlgorithm: () => void;
    if (signal !== undefined) {
      abortAlgorithm = () => {
        const error = new DOMException('Aborted', 'AbortError');
        const actions: Array<() => Promise<void>> = [];
        if (preventAbort === false) {
          actions.push(() => {
            if (dest._state === 'writable') {
              return WritableStreamAbort(dest, error);
            }
            return Promise.resolve();
          });
        }
        if (preventCancel === false) {
          actions.push(() => {
            if (source._state === 'readable') {
              return ReadableStreamCancel(source, error);
            }
            return Promise.resolve();
          });
        }
        shutdownWithAction(() => WaitForAllPromise(actions.map(action => action()), results => results), true, error);
      };

      if (signal.aborted === true) {
        abortAlgorithm();
        return;
      }

      signal.addEventListener('abort', abortAlgorithm);
    }

    // Using reader and writer, read all chunks from this and write them to dest
    // - Backpressure must be enforced
    // - Shutdown must stop all activity
    function pipeLoop() {
      return new Promise<void>((resolveLoop, rejectLoop) => {
        function next(done: boolean) {
          if (done) {
            resolveLoop();
          } else {
            pipeStep().then(next, rejectLoop);
          }
        }

        next(false);
      });
    }

    function pipeStep(): Promise<boolean> {
      if (shuttingDown === true) {
        return Promise.resolve(true);
      }

      return writer._readyPromise.then(() => {
        return ReadableStreamDefaultReaderRead(reader).then(({ value, done }) => {
          if (done === true) {
            return true;
          }

          currentWrite = WritableStreamDefaultWriterWrite(writer, value!).catch(() => {});
          return false;
        });
      });
    }

    // Errors must be propagated forward
    isOrBecomesErrored(source, reader._closedPromise, storedError => {
      if (preventAbort === false) {
        shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
    });

    // Errors must be propagated backward
    isOrBecomesErrored(dest, writer._closedPromise, storedError => {
      if (preventCancel === false) {
        shutdownWithAction(() => ReadableStreamCancel(source, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
    });

    // Closing must be propagated forward
    isOrBecomesClosed(source, reader._closedPromise, () => {
      if (preventClose === false) {
        shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
      } else {
        shutdown();
      }
    });

    // Closing must be propagated backward
    if (WritableStreamCloseQueuedOrInFlight(dest) === true || dest._state === 'closed') {
      const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

      if (preventCancel === false) {
        shutdownWithAction(() => ReadableStreamCancel(source, destClosed), true, destClosed);
      } else {
        shutdown(true, destClosed);
      }
    }

    pipeLoop().catch(rethrowAssertionErrorRejection);

    function waitForWritesToFinish(): Promise<void> {
      // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
      // for that too.
      const oldCurrentWrite = currentWrite;
      return currentWrite.then(() => oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : undefined);
    }

    function isOrBecomesErrored(stream: ReadableStream | WritableStream,
                                promise: Promise<void>,
                                action: (reason: any) => void) {
      if (stream._state === 'errored') {
        action(stream._storedError);
      } else {
        promise.catch(action).catch(rethrowAssertionErrorRejection);
      }
    }

    function isOrBecomesClosed(stream: ReadableStream | WritableStream, promise: Promise<void>, action: () => void) {
      if (stream._state === 'closed') {
        action();
      } else {
        promise.then(action).catch(rethrowAssertionErrorRejection);
      }
    }

    function shutdownWithAction(action: () => Promise<unknown>, originalIsError?: boolean, originalError?: any) {
      if (shuttingDown === true) {
        return;
      }
      shuttingDown = true;

      if (dest._state === 'writable' && WritableStreamCloseQueuedOrInFlight(dest) === false) {
        waitForWritesToFinish().then(doTheRest);
      } else {
        doTheRest();
      }

      function doTheRest() {
        action().then(
          () => finalize(originalIsError, originalError),
          newError => finalize(true, newError)
        ).catch(rethrowAssertionErrorRejection);
      }
    }

    function shutdown(isError?: boolean, error?: any) {
      if (shuttingDown === true) {
        return;
      }
      shuttingDown = true;

      if (dest._state === 'writable' && WritableStreamCloseQueuedOrInFlight(dest) === false) {
        waitForWritesToFinish().then(() => finalize(isError, error)).catch(rethrowAssertionErrorRejection);
      } else {
        finalize(isError, error);
      }
    }

    function finalize(isError?: boolean, error?: any) {
      WritableStreamDefaultWriterRelease(writer);
      ReadableStreamReaderGenericRelease(reader);

      if (signal !== undefined) {
        signal.removeEventListener('abort', abortAlgorithm);
      }
      if (isError) {
        reject(error);
      } else {
        resolve(undefined);
      }
    }
  });
}

function ReadableStreamTee<R>(stream: ReadableStream<R>,
                              cloneForBranch2: boolean): [ReadableStream<R>, ReadableStream<R>] {
  assert(IsReadableStream(stream) === true);
  assert(typeof cloneForBranch2 === 'boolean');

  const reader = AcquireReadableStreamDefaultReader<R>(stream);

  let closedOrErrored = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1: any;
  let reason2: any;
  let branch1: ReadableStream<R>;
  let branch2: ReadableStream<R>;

  let resolveCancelPromise: (reason: any) => void;
  const cancelPromise = new Promise<any>(resolve => {
    resolveCancelPromise = resolve;
  });

  function pullAlgorithm(): Promise<void> {
    return ReadableStreamDefaultReaderRead(reader).then(result => {
      assert(typeIsObject(result));
      const value = result.value;
      const done = result.done;
      assert(typeof done === 'boolean');

      if (done === true && closedOrErrored === false) {
        if (canceled1 === false) {
          ReadableStreamDefaultControllerClose(branch1._readableStreamController as ReadableStreamDefaultController<R>);
        }
        if (canceled2 === false) {
          ReadableStreamDefaultControllerClose(branch2._readableStreamController as ReadableStreamDefaultController<R>);
        }
        closedOrErrored = true;
      }

      if (closedOrErrored === true) {
        return;
      }

      const value1 = value!;
      const value2 = value!;

      // There is no way to access the cloning code right now in the reference implementation.
      // If we add one then we'll need an implementation for serializable objects.
      // if (canceled2 === false && cloneForBranch2 === true) {
      //   value2 = StructuredDeserialize(StructuredSerialize(value2));
      // }

      if (canceled1 === false) {
        ReadableStreamDefaultControllerEnqueue(
          branch1._readableStreamController as ReadableStreamDefaultController<R>,
          value1
        );
      }

      if (canceled2 === false) {
        ReadableStreamDefaultControllerEnqueue(
          branch2._readableStreamController as ReadableStreamDefaultController<R>,
          value2
        );
      }
    });
  }

  function cancel1Algorithm(reason: any): Promise<void> {
    canceled1 = true;
    reason1 = reason;
    if (canceled2 === true) {
      const compositeReason = createArrayFromList([reason1, reason2]);
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  function cancel2Algorithm(reason: any): Promise<void> {
    canceled2 = true;
    reason2 = reason;
    if (canceled1 === true) {
      const compositeReason = createArrayFromList([reason1, reason2]);
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  function startAlgorithm() {}

  branch1 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel1Algorithm);
  branch2 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel2Algorithm);

  reader._closedPromise.catch((r: any) => {
    if (closedOrErrored === true) {
      return;
    }

    ReadableStreamDefaultControllerError(branch1._readableStreamController as ReadableStreamDefaultController<R>, r);
    ReadableStreamDefaultControllerError(branch2._readableStreamController as ReadableStreamDefaultController<R>, r);
    closedOrErrored = true;
  });

  return [branch1, branch2];
}

// ReadableStream API exposed for controllers.

function ReadableStreamAddReadIntoRequest<T extends ArrayBufferView>(stream: ReadableByteStream): Promise<ReadResult<T>> {
  assert(IsReadableStreamBYOBReader(stream._reader) === true);
  assert(stream._state === 'readable' || stream._state === 'closed');

  const promise = new Promise<ReadResult<T>>((resolve, reject) => {
    const readIntoRequest: ReadIntoRequest<T> = {
      _resolve: resolve,
      _reject: reject
    };

    (stream._reader! as ReadableStreamBYOBReader)._readIntoRequests.push(readIntoRequest);
  });

  return promise;
}

function ReadableStreamAddReadRequest<R>(stream: ReadableStream<R>): Promise<ReadResult<R>> {
  assert(IsReadableStreamDefaultReader(stream._reader) === true);
  assert(stream._state === 'readable');

  const promise = new Promise<ReadResult<R>>((resolve, reject) => {
    const readRequest: ReadRequest<R> = {
      _resolve: resolve,
      _reject: reject
    };

    (stream._reader! as ReadableStreamDefaultReader<R>)._readRequests.push(readRequest);
  });

  return promise;
}

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
    for (const { _resolve } of reader._readRequests) {
      _resolve(ReadableStreamCreateReadResult<R>(undefined, true, reader._forAuthorCode));
    }
    reader._readRequests = [];
  }

  defaultReaderClosedPromiseResolve(reader);
}

function ReadableStreamCreateReadResult<T>(value: T | undefined, done: boolean, forAuthorCode: boolean): ReadResult<T> {
  let prototype: object | null = null;
  if (forAuthorCode === true) {
    prototype = Object.prototype;
  }
  assert(typeof done === 'boolean');
  const obj: ReadResult<T> = Object.create(prototype);
  Object.defineProperty(obj, 'value', { value, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(obj, 'done', { value: done, enumerable: true, writable: true, configurable: true });
  return obj;
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
    for (const readRequest of reader._readRequests) {
      readRequest._reject(e);
    }

    reader._readRequests = [];
  } else {
    assert(IsReadableStreamBYOBReader(reader));

    for (const readIntoRequest of reader._readIntoRequests) {
      readIntoRequest._reject(e);
    }

    reader._readIntoRequests = [];
  }

  defaultReaderClosedPromiseReject(reader, e);
}

function ReadableStreamFulfillReadIntoRequest(stream: ReadableByteStream, chunk: ArrayBufferView, done: boolean) {
  const reader = stream._reader as ReadableStreamBYOBReader;

  assert(reader._readIntoRequests.length > 0);

  const readIntoRequest = reader._readIntoRequests.shift()!;
  readIntoRequest._resolve(ReadableStreamCreateReadResult(chunk, done, reader._forAuthorCode));
}

function ReadableStreamFulfillReadRequest<R>(stream: ReadableStream<R>, chunk: R | undefined, done: boolean) {
  const reader = stream._reader as ReadableStreamDefaultReader<R>;

  assert(reader._readRequests.length > 0);

  const readRequest = reader._readRequests.shift()!;
  readRequest._resolve(ReadableStreamCreateReadResult(chunk, done, reader._forAuthorCode));
}

function ReadableStreamGetNumReadIntoRequests(stream: ReadableByteStream): number {
  return (stream._reader as ReadableStreamBYOBReader)._readIntoRequests.length;
}

function ReadableStreamGetNumReadRequests<R>(stream: ReadableStream<R>): number {
  return (stream._reader as ReadableStreamDefaultReader<R>)._readRequests.length;
}

function ReadableStreamHasBYOBReader(stream: ReadableByteStream): boolean {
  const reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (!IsReadableStreamBYOBReader(reader)) {
    return false;
  }

  return true;
}

function ReadableStreamHasDefaultReader(stream: ReadableStream): boolean {
  const reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (!IsReadableStreamDefaultReader(reader)) {
    return false;
  }

  return true;
}

// Readers

type ReadableStreamReader<R> = ReadableStreamDefaultReader<R> | ReadableStreamBYOBReader;

interface ReadRequest<R> {
  _resolve: (value: ReadResult<R>) => void;
  _reject: (reason: any) => void;
}

export type ReadableStreamDefaultReaderType<R> = ReadableStreamDefaultReader<R>;

class ReadableStreamDefaultReader<R> {
  /** @internal */
  _forAuthorCode!: boolean;
  /** @internal */
  _ownerReadableStream!: ReadableStream<R>;
  /** @internal */
  _closedPromise!: Promise<void>;
  /** @internal */
  _closedPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _closedPromise_reject?: (reason: any) => void;
  /** @internal */
  _readRequests: Array<ReadRequest<R>>;

  constructor(stream: ReadableStream<R>) {
    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamDefaultReader can only be constructed with a ReadableStream instance');
    }
    if (IsReadableStreamLocked(stream) === true) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readRequests = [];
  }

  get closed(): Promise<void> {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(defaultReaderBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  cancel(reason: any): Promise<void> {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(defaultReaderBrandCheckException('cancel'));
    }

    if (this._ownerReadableStream === undefined) {
      return Promise.reject(readerLockException('cancel'));
    }

    return ReadableStreamReaderGenericCancel(this, reason);
  }

  read(): Promise<ReadResult<R>> {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(defaultReaderBrandCheckException('read'));
    }

    if (this._ownerReadableStream === undefined) {
      return Promise.reject(readerLockException('read from'));
    }

    return ReadableStreamDefaultReaderRead<R>(this);
  }

  releaseLock(): void {
    if (!IsReadableStreamDefaultReader(this)) {
      throw defaultReaderBrandCheckException('releaseLock');
    }

    if (this._ownerReadableStream === undefined) {
      return;
    }

    if (this._readRequests.length > 0) {
      throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
    }

    ReadableStreamReaderGenericRelease(this);
  }
}

interface ReadIntoRequest<T extends ArrayBufferView> {
  _resolve: (value: ReadResult<T>) => void;
  _reject: (reason: any) => void;
}

export type ReadableStreamBYOBReaderType = ReadableStreamBYOBReader;

class ReadableStreamBYOBReader {
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
  _readIntoRequests: Array<ReadIntoRequest<any>>;

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

    this._readIntoRequests = [];
  }

  get closed(): Promise<void> {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(byobReaderBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  cancel(reason: any): Promise<void> {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(byobReaderBrandCheckException('cancel'));
    }

    if (this._ownerReadableStream === undefined) {
      return Promise.reject(readerLockException('cancel'));
    }

    return ReadableStreamReaderGenericCancel(this, reason);
  }

  read<T extends ArrayBufferView>(view: T): Promise<ReadResult<T>> {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(byobReaderBrandCheckException('read'));
    }

    if (this._ownerReadableStream === undefined) {
      return Promise.reject(readerLockException('read from'));
    }

    if (!ArrayBuffer.isView(view)) {
      return Promise.reject(new TypeError('view must be an array buffer view'));
    }

    if (IsDetachedBuffer(view.buffer) === true) {
      return Promise.reject(new TypeError('Cannot read into a view onto a detached ArrayBuffer'));
    }

    if (view.byteLength === 0) {
      return Promise.reject(new TypeError('view must have non-zero byteLength'));
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

function IsReadableStreamBYOBReader(x: any): x is ReadableStreamBYOBReader {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
    return false;
  }

  return true;
}

function IsReadableStreamDefaultReader<R>(x: any): x is ReadableStreamDefaultReader<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
    return false;
  }

  return true;
}

function ReadableStreamReaderGenericInitialize<R>(reader: ReadableStreamReader<R>, stream: ReadableStream<R>) {
  reader._forAuthorCode = true;
  reader._ownerReadableStream = stream;
  stream._reader = reader;

  if (stream._state === 'readable') {
    defaultReaderClosedPromiseInitialize(reader);
  } else if (stream._state === 'closed') {
    defaultReaderClosedPromiseInitializeAsResolved(reader);
  } else {
    assert(stream._state === 'errored');

    defaultReaderClosedPromiseInitializeAsRejected(reader, stream._storedError);
  }
}

// A client of ReadableStreamDefaultReader and ReadableStreamBYOBReader may use these functions directly to bypass state
// check.

function ReadableStreamReaderGenericCancel(reader: ReadableStreamReader<any>, reason: any): Promise<void> {
  const stream = reader._ownerReadableStream;
  assert(stream !== undefined);
  return ReadableStreamCancel(stream, reason);
}

function ReadableStreamReaderGenericRelease(reader: ReadableStreamReader<any>) {
  assert(reader._ownerReadableStream !== undefined);
  assert(reader._ownerReadableStream._reader === reader);

  if (reader._ownerReadableStream._state === 'readable') {
    defaultReaderClosedPromiseReject(
      reader,
      new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
  } else {
    defaultReaderClosedPromiseResetToRejected(
      reader,
      new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
  }

  reader._ownerReadableStream._reader = undefined;
  reader._ownerReadableStream = undefined!;
}

function ReadableStreamBYOBReaderRead<T extends ArrayBufferView>(reader: ReadableStreamBYOBReader,
                                                                 view: T): Promise<ReadResult<T>> {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  // Controllers must implement this.
  return ReadableByteStreamControllerPullInto(stream._readableStreamController as ReadableByteStreamController,
                                              view);
}

function ReadableStreamDefaultReaderRead<R>(reader: ReadableStreamDefaultReader<R>): Promise<ReadResult<R>> {
  const stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(ReadableStreamCreateReadResult<R>(undefined, true, reader._forAuthorCode));
  }

  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  assert(stream._state === 'readable');

  return stream._readableStreamController[PullSteps]() as unknown as Promise<ReadResult<R>>;
}

// Controllers

export type ReadableStreamDefaultControllerType<R> = ReadableStreamDefaultController<R>;

class ReadableStreamDefaultController<R> {
  /** @internal */
  _controlledReadableStream!: ReadableStream<R>;
  /** @internal */
  _queue!: Array<QueuePair<R>>;
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

class ReadableStreamBYOBRequest {
  /** @internal */
  _associatedReadableByteStreamController!: ReadableByteStreamController;
  /** @internal */
  _view!: ArrayBufferView;

  /** @internal */
  constructor() {
    throw new TypeError('ReadableStreamBYOBRequest cannot be used directly');
  }

  get view(): ArrayBufferView {
    if (IsReadableStreamBYOBRequest(this) === false) {
      throw byobRequestBrandCheckException('view');
    }

    return this._view;
  }

  respond(bytesWritten: number): void {
    if (IsReadableStreamBYOBRequest(this) === false) {
      throw byobRequestBrandCheckException('respond');
    }

    if (this._associatedReadableByteStreamController === undefined) {
      throw new TypeError('This BYOB request has been invalidated');
    }

    if (IsDetachedBuffer(this._view.buffer) === true) {
      throw new TypeError('The BYOB request\'s buffer has been detached and so cannot be used as a response');
    }

    ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
  }

  respondWithNewView(view: ArrayBufferView): void {
    if (IsReadableStreamBYOBRequest(this) === false) {
      throw byobRequestBrandCheckException('respond');
    }

    if (this._associatedReadableByteStreamController === undefined) {
      throw new TypeError('This BYOB request has been invalidated');
    }

    if (!ArrayBuffer.isView(view)) {
      throw new TypeError('You can only respond with array buffer views');
    }

    if (IsDetachedBuffer(view.buffer) === true) {
      throw new TypeError('The supplied view\'s buffer has been detached and so cannot be used as a response');
    }

    ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
  }
}

interface ArrayBufferViewConstructor<T extends ArrayBufferView = ArrayBufferView> {
  new(buffer: ArrayBufferLike, byteOffset: number, length?: number): T;

  readonly prototype: T;
  readonly BYTES_PER_ELEMENT: number;
}

interface ByteQueueElement {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
}

type PullIntoDescriptor<T extends ArrayBufferView = ArrayBufferView> =
  DefaultPullIntoDescriptor
  | BYOBPullIntoDescriptor;

interface DefaultPullIntoDescriptor {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
  bytesFilled: number;
  elementSize: number;
  ctor: ArrayBufferViewConstructor<Uint8Array>;
  readerType: 'default';
}

interface BYOBPullIntoDescriptor<T extends ArrayBufferView = ArrayBufferView> {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
  bytesFilled: number;
  elementSize: number;
  ctor: ArrayBufferViewConstructor<T>;
  readerType: 'byob';
}

export type ReadableByteStreamControllerType = ReadableByteStreamController;

class ReadableByteStreamController {
  /** @internal */
  _controlledReadableByteStream!: ReadableByteStream;
  /** @internal */
  _queue!: ByteQueueElement[];
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
  _strategyHWM!: number;
  /** @internal */
  _pullAlgorithm!: () => Promise<void>;
  /** @internal */
  _cancelAlgorithm!: (reason: any) => Promise<void>;
  /** @internal */
  _autoAllocateChunkSize: number | undefined;
  /** @internal */
  _byobRequest: ReadableStreamBYOBRequest | undefined;
  /** @internal */
  _pendingPullIntos!: PullIntoDescriptor[];

  /** @internal */
  constructor() {
    throw new TypeError('ReadableByteStreamController constructor cannot be used directly');
  }

  get byobRequest(): ReadableStreamBYOBRequest | undefined {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('byobRequest');
    }

    if (this._byobRequest === undefined && this._pendingPullIntos.length > 0) {
      const firstDescriptor = this._pendingPullIntos[0];
      const view = new Uint8Array(firstDescriptor.buffer,
                                  firstDescriptor.byteOffset + firstDescriptor.bytesFilled,
                                  firstDescriptor.byteLength - firstDescriptor.bytesFilled);

      const byobRequest: ReadableStreamBYOBRequest = Object.create(ReadableStreamBYOBRequest.prototype);
      SetUpReadableStreamBYOBRequest(byobRequest, this, view);
      this._byobRequest = byobRequest;
    }

    return this._byobRequest;
  }

  get desiredSize(): number | null {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('desiredSize');
    }

    return ReadableByteStreamControllerGetDesiredSize(this);
  }

  close(): void {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('close');
    }

    if (this._closeRequested === true) {
      throw new TypeError('The stream has already been closed; do not close it again!');
    }

    const state = this._controlledReadableByteStream._state;
    if (state !== 'readable') {
      throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be closed`);
    }

    ReadableByteStreamControllerClose(this);
  }

  enqueue(chunk: ArrayBufferView): void {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('enqueue');
    }

    if (this._closeRequested === true) {
      throw new TypeError('stream is closed or draining');
    }

    const state = this._controlledReadableByteStream._state;
    if (state !== 'readable') {
      throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be enqueued to`);
    }

    if (!ArrayBuffer.isView(chunk)) {
      throw new TypeError('You can only enqueue array buffer views when using a ReadableByteStreamController');
    }

    if (IsDetachedBuffer(chunk.buffer) === true) {
      throw new TypeError('Cannot enqueue a view onto a detached ArrayBuffer');
    }

    ReadableByteStreamControllerEnqueue(this, chunk);
  }

  error(e: any): void {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('error');
    }

    ReadableByteStreamControllerError(this, e);
  }

  /** @internal */
  [CancelSteps](reason: any): Promise<void> {
    if (this._pendingPullIntos.length > 0) {
      const firstDescriptor = this._pendingPullIntos[0];
      firstDescriptor.bytesFilled = 0;
    }

    ResetQueue(this);

    const result = this._cancelAlgorithm(reason);
    ReadableByteStreamControllerClearAlgorithms(this);
    return result;
  }

  /** @internal */
  [PullSteps](): Promise<ReadResult<ArrayBufferView>> {
    const stream = this._controlledReadableByteStream;
    assert(ReadableStreamHasDefaultReader(stream) === true);

    if (this._queueTotalSize > 0) {
      assert(ReadableStreamGetNumReadRequests(stream) === 0);

      const entry = this._queue.shift()!;
      this._queueTotalSize -= entry.byteLength;

      ReadableByteStreamControllerHandleQueueDrain(this);

      let view: ArrayBufferView;
      try {
        view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
      } catch (viewE) {
        return Promise.reject(viewE);
      }

      return Promise.resolve(ReadableStreamCreateReadResult(view, false, stream._reader!._forAuthorCode));
    }

    const autoAllocateChunkSize = this._autoAllocateChunkSize;
    if (autoAllocateChunkSize !== undefined) {
      let buffer: ArrayBuffer;
      try {
        buffer = new ArrayBuffer(autoAllocateChunkSize);
      } catch (bufferE) {
        return Promise.reject(bufferE);
      }

      const pullIntoDescriptor: DefaultPullIntoDescriptor = {
        buffer,
        byteOffset: 0,
        byteLength: autoAllocateChunkSize,
        bytesFilled: 0,
        elementSize: 1,
        ctor: Uint8Array,
        readerType: 'default'
      };

      this._pendingPullIntos.push(pullIntoDescriptor);
    }

    const promise = ReadableStreamAddReadRequest(stream);

    ReadableByteStreamControllerCallPullIfNeeded(this);

    return promise;
  }
}

// Abstract operations for the ReadableByteStreamController.

function IsReadableByteStreamController(x: any): x is ReadableByteStreamController {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableByteStream')) {
    return false;
  }

  return true;
}

function IsReadableStreamBYOBRequest(x: any): x is ReadableStreamBYOBRequest {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_associatedReadableByteStreamController')) {
    return false;
  }

  return true;
}

function ReadableByteStreamControllerCallPullIfNeeded(controller: ReadableByteStreamController): void {
  const shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return;
  }

  assert(controller._pullAgain === false);

  controller._pulling = true;

  // TODO: Test controller argument
  const pullPromise = controller._pullAlgorithm();
  pullPromise.then(
    () => {
      controller._pulling = false;

      if (controller._pullAgain === true) {
        controller._pullAgain = false;
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }
    },
    e => {
      ReadableByteStreamControllerError(controller, e);
    }
  ).catch(rethrowAssertionErrorRejection);
}

function ReadableByteStreamControllerClearPendingPullIntos(controller: ReadableByteStreamController) {
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  controller._pendingPullIntos = [];
}

function ReadableByteStreamControllerCommitPullIntoDescriptor<T extends ArrayBufferView>(stream: ReadableByteStream,
                                                                                         pullIntoDescriptor: PullIntoDescriptor<T>) {
  assert(stream._state !== 'errored');

  let done = false;
  if (stream._state === 'closed') {
    assert(pullIntoDescriptor.bytesFilled === 0);
    done = true;
  }

  const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor<T>(pullIntoDescriptor);
  if (pullIntoDescriptor.readerType === 'default') {
    ReadableStreamFulfillReadRequest(stream, filledView as unknown as Uint8Array, done);
  } else {
    assert(pullIntoDescriptor.readerType === 'byob');
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
}

function ReadableByteStreamControllerConvertPullIntoDescriptor<T extends ArrayBufferView>(pullIntoDescriptor: PullIntoDescriptor<T>): T {
  const bytesFilled = pullIntoDescriptor.bytesFilled;
  const elementSize = pullIntoDescriptor.elementSize;

  assert(bytesFilled <= pullIntoDescriptor.byteLength);
  assert(bytesFilled % elementSize === 0);

  return new pullIntoDescriptor.ctor(
    pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize) as T;
}

function ReadableByteStreamControllerEnqueueChunkToQueue(controller: ReadableByteStreamController,
                                                         buffer: ArrayBufferLike,
                                                         byteOffset: number,
                                                         byteLength: number) {
  controller._queue.push({ buffer, byteOffset, byteLength });
  controller._queueTotalSize += byteLength;
}

function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller: ReadableByteStreamController,
                                                                     pullIntoDescriptor: PullIntoDescriptor) {
  const elementSize = pullIntoDescriptor.elementSize;

  const currentAlignedBytes = pullIntoDescriptor.bytesFilled - pullIntoDescriptor.bytesFilled % elementSize;

  const maxBytesToCopy = Math.min(controller._queueTotalSize,
                                  pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
  const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
  const maxAlignedBytes = maxBytesFilled - maxBytesFilled % elementSize;

  let totalBytesToCopyRemaining = maxBytesToCopy;
  let ready = false;
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }

  const queue = controller._queue;

  while (totalBytesToCopyRemaining > 0) {
    const headOfQueue = queue[0];

    const bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);

    const destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    ArrayBufferCopy(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);

    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller._queueTotalSize -= bytesToCopy;

    ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesToCopy, pullIntoDescriptor);

    totalBytesToCopyRemaining -= bytesToCopy;
  }

  if (ready === false) {
    assert(controller._queueTotalSize === 0);
    assert(pullIntoDescriptor.bytesFilled > 0);
    assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize);
  }

  return ready;
}

function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller: ReadableByteStreamController,
                                                                size: number,
                                                                pullIntoDescriptor: PullIntoDescriptor) {
  assert(controller._pendingPullIntos.length === 0 || controller._pendingPullIntos[0] === pullIntoDescriptor);

  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  pullIntoDescriptor.bytesFilled += size;
}

function ReadableByteStreamControllerHandleQueueDrain(controller: ReadableByteStreamController) {
  assert(controller._controlledReadableByteStream._state === 'readable');

  if (controller._queueTotalSize === 0 && controller._closeRequested === true) {
    ReadableByteStreamControllerClearAlgorithms(controller);
    ReadableStreamClose(controller._controlledReadableByteStream);
  } else {
    ReadableByteStreamControllerCallPullIfNeeded(controller);
  }
}

function ReadableByteStreamControllerInvalidateBYOBRequest(controller: ReadableByteStreamController) {
  if (controller._byobRequest === undefined) {
    return;
  }

  controller._byobRequest._associatedReadableByteStreamController = undefined!;
  controller._byobRequest._view = undefined!;
  controller._byobRequest = undefined;
}

function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller: ReadableByteStreamController) {
  assert(controller._closeRequested === false);

  while (controller._pendingPullIntos.length > 0) {
    if (controller._queueTotalSize === 0) {
      return;
    }

    const pullIntoDescriptor = controller._pendingPullIntos[0];

    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      ReadableByteStreamControllerShiftPendingPullInto(controller);

      ReadableByteStreamControllerCommitPullIntoDescriptor(
        controller._controlledReadableByteStream,
        pullIntoDescriptor
      );
    }
  }
}

function ReadableByteStreamControllerPullInto<T extends ArrayBufferView>(controller: ReadableByteStreamController,
                                                                         view: T): Promise<ReadResult<T>> {
  const stream = controller._controlledReadableByteStream;

  let elementSize = 1;
  if (view.constructor !== DataView) {
    elementSize = (view.constructor as ArrayBufferViewConstructor<T>).BYTES_PER_ELEMENT;
  }

  const ctor = view.constructor as ArrayBufferViewConstructor<T>;

  const buffer = TransferArrayBuffer(view.buffer);
  const pullIntoDescriptor: BYOBPullIntoDescriptor<T> = {
    buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
    bytesFilled: 0,
    elementSize,
    ctor,
    readerType: 'byob'
  };

  if (controller._pendingPullIntos.length > 0) {
    controller._pendingPullIntos.push(pullIntoDescriptor);

    // No ReadableByteStreamControllerCallPullIfNeeded() call since:
    // - No change happens on desiredSize
    // - The source has already been notified of that there's at least 1 pending read(view)

    return ReadableStreamAddReadIntoRequest(stream);
  }

  if (stream._state === 'closed') {
    const emptyView = new ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, 0);
    return Promise.resolve(ReadableStreamCreateReadResult(emptyView, true, stream._reader!._forAuthorCode));
  }

  if (controller._queueTotalSize > 0) {
    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor<T>(pullIntoDescriptor);

      ReadableByteStreamControllerHandleQueueDrain(controller);

      return Promise.resolve(ReadableStreamCreateReadResult(filledView, false, stream._reader!._forAuthorCode));
    }

    if (controller._closeRequested === true) {
      const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      return Promise.reject(e);
    }
  }

  controller._pendingPullIntos.push(pullIntoDescriptor);

  const promise = ReadableStreamAddReadIntoRequest<T>(stream);

  ReadableByteStreamControllerCallPullIfNeeded(controller);

  return promise;
}

function ReadableByteStreamControllerRespondInClosedState(controller: ReadableByteStreamController,
                                                          firstDescriptor: PullIntoDescriptor) {
  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);

  assert(firstDescriptor.bytesFilled === 0);

  const stream = controller._controlledReadableByteStream;
  if (ReadableStreamHasBYOBReader(stream) === true) {
    while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
      const pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(controller);
      ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
    }
  }
}

function ReadableByteStreamControllerRespondInReadableState(controller: ReadableByteStreamController,
                                                            bytesWritten: number,
                                                            pullIntoDescriptor: PullIntoDescriptor) {
  if (pullIntoDescriptor.bytesFilled + bytesWritten > pullIntoDescriptor.byteLength) {
    throw new RangeError('bytesWritten out of range');
  }

  ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);

  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    // TODO: Figure out whether we should detach the buffer or not here.
    return;
  }

  ReadableByteStreamControllerShiftPendingPullInto(controller);

  const remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    const remainder = pullIntoDescriptor.buffer.slice(end - remainderSize, end);
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, remainder, 0, remainder.byteLength);
  }

  pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.bytesFilled -= remainderSize;
  ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);

  ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
}

function ReadableByteStreamControllerRespondInternal(controller: ReadableByteStreamController, bytesWritten: number) {
  const firstDescriptor = controller._pendingPullIntos[0];

  const stream = controller._controlledReadableByteStream;

  if (stream._state === 'closed') {
    if (bytesWritten !== 0) {
      throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
    }

    ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
  } else {
    assert(stream._state === 'readable');

    ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
  }

  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

function ReadableByteStreamControllerShiftPendingPullInto(controller: ReadableByteStreamController): PullIntoDescriptor {
  const descriptor = controller._pendingPullIntos.shift()!;
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  return descriptor;
}

function ReadableByteStreamControllerShouldCallPull(controller: ReadableByteStreamController): boolean {
  const stream = controller._controlledReadableByteStream;

  if (stream._state !== 'readable') {
    return false;
  }

  if (controller._closeRequested === true) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (ReadableStreamHasDefaultReader(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  if (ReadableStreamHasBYOBReader(stream) === true && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
    return true;
  }

  const desiredSize = ReadableByteStreamControllerGetDesiredSize(controller);
  assert(desiredSize !== null);
  if (desiredSize! > 0) {
    return true;
  }

  return false;
}

function ReadableByteStreamControllerClearAlgorithms(controller: ReadableByteStreamController) {
  controller._pullAlgorithm = undefined!;
  controller._cancelAlgorithm = undefined!;
}

// A client of ReadableByteStreamController may use these functions directly to bypass state check.

function ReadableByteStreamControllerClose(controller: ReadableByteStreamController) {
  const stream = controller._controlledReadableByteStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  if (controller._queueTotalSize > 0) {
    controller._closeRequested = true;

    return;
  }

  if (controller._pendingPullIntos.length > 0) {
    const firstPendingPullInto = controller._pendingPullIntos[0];
    if (firstPendingPullInto.bytesFilled > 0) {
      const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      throw e;
    }
  }

  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamClose(stream);
}

function ReadableByteStreamControllerEnqueue(controller: ReadableByteStreamController, chunk: ArrayBufferView) {
  const stream = controller._controlledReadableByteStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  const buffer = chunk.buffer;
  const byteOffset = chunk.byteOffset;
  const byteLength = chunk.byteLength;
  const transferredBuffer = TransferArrayBuffer(buffer);

  if (ReadableStreamHasDefaultReader(stream) === true) {
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    } else {
      assert(controller._queue.length === 0);

      const transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
      ReadableStreamFulfillReadRequest(stream, transferredView, false);
    }
  } else if (ReadableStreamHasBYOBReader(stream) === true) {
    // TODO: Ideally in this branch detaching should happen only if the buffer is not consumed fully.
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
  } else {
    assert(IsReadableStreamLocked(stream) === false);
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
  }

  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

function ReadableByteStreamControllerError(controller: ReadableByteStreamController, e: any) {
  const stream = controller._controlledReadableByteStream;

  if (stream._state !== 'readable') {
    return;
  }

  ReadableByteStreamControllerClearPendingPullIntos(controller);

  ResetQueue(controller);
  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamError(stream, e);
}

function ReadableByteStreamControllerGetDesiredSize(controller: ReadableByteStreamController): number | null {
  const stream = controller._controlledReadableByteStream;
  const state = stream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

function ReadableByteStreamControllerRespond(controller: ReadableByteStreamController, bytesWritten: number) {
  bytesWritten = Number(bytesWritten);
  if (IsFiniteNonNegativeNumber(bytesWritten) === false) {
    throw new RangeError('bytesWritten must be a finite');
  }

  assert(controller._pendingPullIntos.length > 0);

  ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
}

function ReadableByteStreamControllerRespondWithNewView(controller: ReadableByteStreamController,
                                                        view: ArrayBufferView) {
  assert(controller._pendingPullIntos.length > 0);

  const firstDescriptor = controller._pendingPullIntos[0];

  if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
    throw new RangeError('The region specified by view does not match byobRequest');
  }
  if (firstDescriptor.byteLength !== view.byteLength) {
    throw new RangeError('The buffer of view has different capacity than byobRequest');
  }

  firstDescriptor.buffer = view.buffer;

  ReadableByteStreamControllerRespondInternal(controller, view.byteLength);
}

function SetUpReadableByteStreamController(stream: ReadableByteStream,
                                           controller: ReadableByteStreamController,
                                           startAlgorithm: () => void | PromiseLike<void>,
                                           pullAlgorithm: () => Promise<void>,
                                           cancelAlgorithm: (reason: any) => Promise<void>,
                                           highWaterMark: number,
                                           autoAllocateChunkSize: number | undefined) {
  assert(stream._readableStreamController === undefined);
  if (autoAllocateChunkSize !== undefined) {
    assert(NumberIsInteger(autoAllocateChunkSize) === true);
    assert(autoAllocateChunkSize > 0);
  }

  controller._controlledReadableByteStream = stream;

  controller._pullAgain = false;
  controller._pulling = false;

  controller._byobRequest = undefined;

  // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
  controller._queue = controller._queueTotalSize = undefined!;
  ResetQueue(controller);

  controller._closeRequested = false;
  controller._started = false;

  controller._strategyHWM = ValidateAndNormalizeHighWaterMark(highWaterMark);

  controller._pullAlgorithm = pullAlgorithm;
  controller._cancelAlgorithm = cancelAlgorithm;

  controller._autoAllocateChunkSize = autoAllocateChunkSize;

  controller._pendingPullIntos = [];

  stream._readableStreamController = controller;

  const startResult = startAlgorithm();
  Promise.resolve(startResult).then(
    () => {
      controller._started = true;

      assert(controller._pulling === false);
      assert(controller._pullAgain === false);

      ReadableByteStreamControllerCallPullIfNeeded(controller);
    },
    r => {
      ReadableByteStreamControllerError(controller, r);
    }
  ).catch(rethrowAssertionErrorRejection);
}

function SetUpReadableByteStreamControllerFromUnderlyingSource(stream: ReadableByteStream,
                                                               underlyingByteSource: UnderlyingByteSource,
                                                               highWaterMark: number) {
  assert(underlyingByteSource !== undefined);

  const controller: ReadableByteStreamController = Object.create(ReadableByteStreamController.prototype);

  function startAlgorithm() {
    return InvokeOrNoop<typeof underlyingByteSource, 'start'>(underlyingByteSource, 'start', [controller]);
  }

  const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof underlyingByteSource, 'pull'>(
    underlyingByteSource, 'pull', 0, [controller]
  );
  const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof underlyingByteSource, 'cancel'>(
    underlyingByteSource, 'cancel', 1, []
  );

  let autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
  if (autoAllocateChunkSize !== undefined) {
    autoAllocateChunkSize = Number(autoAllocateChunkSize);
    if (NumberIsInteger(autoAllocateChunkSize) === false || autoAllocateChunkSize <= 0) {
      throw new RangeError('autoAllocateChunkSize must be a positive integer');
    }
  }

  SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark,
                                    autoAllocateChunkSize);
}

function SetUpReadableStreamBYOBRequest(request: ReadableStreamBYOBRequest,
                                        controller: ReadableByteStreamController,
                                        view: ArrayBufferView) {
  assert(IsReadableByteStreamController(controller) === true);
  assert(typeof view === 'object');
  assert(ArrayBuffer.isView(view) === true);
  assert(IsDetachedBuffer(view.buffer) === false);
  request._associatedReadableByteStreamController = controller;
  request._view = view;
}

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

function streamAsyncIteratorBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
}

// Helper functions for the readers.

function readerLockException(name: string): TypeError {
  return new TypeError('Cannot ' + name + ' a stream using a released reader');
}

// Helper functions for the ReadableStreamDefaultReader.

function defaultReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamDefaultReader.prototype.${name} can only be used on a ReadableStreamDefaultReader`);
}

function defaultReaderClosedPromiseInitialize(reader: ReadableStreamReader<any>) {
  reader._closedPromise = new Promise((resolve, reject) => {
    reader._closedPromise_resolve = resolve;
    reader._closedPromise_reject = reject;
  });
}

function defaultReaderClosedPromiseInitializeAsRejected(reader: ReadableStreamReader<any>, reason: any) {
  defaultReaderClosedPromiseInitialize(reader);
  defaultReaderClosedPromiseReject(reader, reason);
}

function defaultReaderClosedPromiseInitializeAsResolved(reader: ReadableStreamReader<any>) {
  defaultReaderClosedPromiseInitialize(reader);
  defaultReaderClosedPromiseResolve(reader);
}

function defaultReaderClosedPromiseReject(reader: ReadableStreamReader<any>, reason: any) {
  assert(reader._closedPromise_resolve !== undefined);
  assert(reader._closedPromise_reject !== undefined);

  reader._closedPromise.catch(() => {});
  reader._closedPromise_reject!(reason);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function defaultReaderClosedPromiseResetToRejected(reader: ReadableStreamReader<any>, reason: any) {
  assert(reader._closedPromise_resolve === undefined);
  assert(reader._closedPromise_reject === undefined);

  defaultReaderClosedPromiseInitializeAsRejected(reader, reason);
}

function defaultReaderClosedPromiseResolve(reader: ReadableStreamReader<any>) {
  assert(reader._closedPromise_resolve !== undefined);
  assert(reader._closedPromise_reject !== undefined);

  reader._closedPromise_resolve!(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

// Helper functions for the ReadableStreamDefaultReader.

function byobReaderBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamBYOBReader.prototype.${name} can only be used on a ReadableStreamBYOBReader`);
}

// Helper functions for the ReadableStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamDefaultController.prototype.${name} can only be used on a ReadableStreamDefaultController`);
}

// Helper functions for the ReadableStreamBYOBRequest.

function byobRequestBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamBYOBRequest.prototype.${name} can only be used on a ReadableStreamBYOBRequest`);
}

// Helper functions for the ReadableByteStreamController.

function byteStreamControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableByteStreamController.prototype.${name} can only be used on a ReadableByteStreamController`);
}
