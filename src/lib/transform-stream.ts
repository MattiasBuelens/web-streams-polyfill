import assert from '../stub/assert';
import { newPromise, promiseRejectedWith, promiseResolvedWith, transformPromiseWith } from './helpers/webidl';
import type { ReadableStreamDefaultController, ReadableStreamState } from './readable-stream';
import { IsReadableStream, ReadableStream } from './readable-stream';
import type { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import type { WritableStreamDefaultController, WritableStreamState } from './writable-stream';
import { IsWritableStream, WritableStream } from './writable-stream';
import { typeIsObject } from './helpers/miscellaneous';
import { IsNonNegativeNumber } from './abstract-ops/miscellaneous';
import { convertQueuingStrategy } from './validators/queuing-strategy';
import { ExtractHighWaterMark, ExtractSizeAlgorithm } from './abstract-ops/queuing-strategy';
import type { ValidatedTransformer } from './transform-stream/transformer';
import {
  Transformer,
  TransformerFlushCallback,
  TransformerStartCallback,
  TransformerTransformCallback
} from './transform-stream/transformer';
import { convertTransformer } from './validators/transformer';
import type { ReadableStreamLike, WritableStreamLike } from './helpers/stream-like';

// Class TransformStream

/**
 * A transform stream consists of a pair of streams: a {@link WritableStream | writable stream},
 * known as its writable side, and a {@link ReadableStream | readable stream}, known as its readable side.
 * In a manner specific to the transform stream in question, writes to the writable side result in new data being
 * made available for reading from the readable side.
 *
 * @public
 */
export class TransformStream<I = any, O = any> {
  /**
   * The writable side of the transform stream.
   *
   * We use `WritableStreamLike` instead of `WritableStream` so we can only use the public API,
   * and we don't accidentally depend on internal state or abstract operations.
   * This allows for interoperability with native streams.
   * @internal
   */
  _writable!: WritableStreamLike<I>;
  /** @internal */
  _writableController!: WritableStreamDefaultController;
  /** @internal */
  _writableState!: WritableStreamState;
  /** @internal */
  _writableStoredError!: any;
  /** @internal */
  _writableHasInFlightOperation!: boolean;
  /** @internal */
  _writableStarted!: boolean;
  /**
   * The readable side of the transform stream.
   *
   * We use `ReadableStreamLike` instead of `ReadableStream` so we can only use the public API
   * and allow for interoperability with native streams.
   * @internal
   */
  _readable!: ReadableStreamLike<O>;
  /** @internal */
  _readableController!: ReadableStreamDefaultController<O>;
  /** @internal */
  _readableState!: ReadableStreamState;
  /** @internal */
  _readableStoredError!: any;
  /** @internal */
  _readableCloseRequested!: boolean;
  /** @internal */
  _readablePulling!: boolean;
  /** @internal */
  _backpressure!: boolean;
  /** @internal */
  _backpressureChangePromise!: Promise<void>;
  /** @internal */
  _backpressureChangePromise_resolve!: () => void;
  /** @internal */
  _transformStreamController!: TransformStreamDefaultController<O>;

  constructor(
    transformer?: Transformer<I, O>,
    writableStrategy?: QueuingStrategy<I>,
    readableStrategy?: QueuingStrategy<O>
  );
  constructor(rawTransformer: Transformer<I, O> | null | undefined = {},
              rawWritableStrategy: QueuingStrategy<I> | null | undefined = {},
              rawReadableStrategy: QueuingStrategy<O> | null | undefined = {}) {
    if (rawTransformer === undefined) {
      rawTransformer = null;
    }

    const writableStrategy = convertQueuingStrategy(rawWritableStrategy, 'Second parameter');
    const readableStrategy = convertQueuingStrategy(rawReadableStrategy, 'Third parameter');

    const transformer = convertTransformer(rawTransformer, 'First parameter');
    if (transformer.readableType !== undefined) {
      throw new RangeError('Invalid readableType specified');
    }
    if (transformer.writableType !== undefined) {
      throw new RangeError('Invalid writableType specified');
    }

    const readableHighWaterMark = ExtractHighWaterMark(readableStrategy, 0);
    const readableSizeAlgorithm = ExtractSizeAlgorithm(readableStrategy);
    const writableHighWaterMark = ExtractHighWaterMark(writableStrategy, 1);
    const writableSizeAlgorithm = ExtractSizeAlgorithm(writableStrategy);

    let startPromise_resolve!: (value: void | PromiseLike<void>) => void;
    const startPromise = newPromise<void>(resolve => {
      startPromise_resolve = resolve;
    });

    InitializeTransformStream(
      this, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm
    );
    SetUpTransformStreamDefaultControllerFromTransformer(this, transformer);

    if (transformer.start !== undefined) {
      startPromise_resolve(transformer.start(this._transformStreamController));
    } else {
      startPromise_resolve(undefined);
    }
  }

  /**
   * The readable side of the transform stream.
   */
  get readable(): ReadableStream<O> {
    if (!IsTransformStream(this)) {
      throw streamBrandCheckException('readable');
    }

    return this._readable as ReadableStream<O>;
  }

  /**
   * The writable side of the transform stream.
   */
  get writable(): WritableStream<I> {
    if (!IsTransformStream(this)) {
      throw streamBrandCheckException('writable');
    }

    return this._writable as WritableStream<I>;
  }
}

Object.defineProperties(TransformStream.prototype, {
  readable: { enumerable: true },
  writable: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(TransformStream.prototype, Symbol.toStringTag, {
    value: 'TransformStream',
    configurable: true
  });
}

export {
  Transformer,
  TransformerStartCallback,
  TransformerFlushCallback,
  TransformerTransformCallback
};

// Transform Stream Abstract Operations

export function CreateTransformStream<I, O>(startAlgorithm: () => void | PromiseLike<void>,
                                            transformAlgorithm: (chunk: I) => Promise<void>,
                                            flushAlgorithm: () => Promise<void>,
                                            writableHighWaterMark = 1,
                                            writableSizeAlgorithm: QueuingStrategySizeCallback<I> = () => 1,
                                            readableHighWaterMark = 0,
                                            readableSizeAlgorithm: QueuingStrategySizeCallback<O> = () => 1) {
  assert(IsNonNegativeNumber(writableHighWaterMark));
  assert(IsNonNegativeNumber(readableHighWaterMark));

  const stream: TransformStream<I, O> = Object.create(TransformStream.prototype);

  let startPromise_resolve!: (value: void | PromiseLike<void>) => void;
  const startPromise = newPromise<void>(resolve => {
    startPromise_resolve = resolve;
  });

  InitializeTransformStream(stream, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark,
                            readableSizeAlgorithm);

  const controller: TransformStreamDefaultController<O> = Object.create(TransformStreamDefaultController.prototype);

  SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm);

  const startResult = startAlgorithm();
  startPromise_resolve(startResult);
  return stream;
}

function InitializeTransformStream<I, O>(stream: TransformStream<I, O>,
                                         startPromise: Promise<void>,
                                         writableHighWaterMark: number,
                                         writableSizeAlgorithm: QueuingStrategySizeCallback<I>,
                                         readableHighWaterMark: number,
                                         readableSizeAlgorithm: QueuingStrategySizeCallback<O>) {
  function startAlgorithm(): Promise<void> {
    return startPromise;
  }

  function writeAlgorithm(chunk: I): Promise<void> {
    return TransformStreamDefaultSinkWriteAlgorithm(stream, chunk);
  }

  function abortAlgorithm(reason: any): Promise<void> {
    return TransformStreamDefaultSinkAbortAlgorithm(stream, reason);
  }

  function closeAlgorithm(): Promise<void> {
    return TransformStreamDefaultSinkCloseAlgorithm(stream);
  }

  stream._writableState = 'writable';
  stream._writableStoredError = undefined;
  stream._writableHasInFlightOperation = false;
  stream._writableStarted = false;
  stream._writable = CreateWritableStream(
    stream,
    startAlgorithm,
    writeAlgorithm,
    closeAlgorithm,
    abortAlgorithm,
    writableHighWaterMark,
    writableSizeAlgorithm
  );

  function pullAlgorithm(): Promise<void> {
    return TransformStreamDefaultSourcePullAlgorithm(stream);
  }

  function cancelAlgorithm(reason: any): Promise<void> {
    TransformStreamErrorWritableAndUnblockWrite(stream, reason);
    return promiseResolvedWith(undefined);
  }

  stream._readableState = 'readable';
  stream._readableStoredError = undefined;
  stream._readableCloseRequested = false;
  stream._readablePulling = false;
  stream._readable = CreateReadableStream(
    stream,
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm,
    readableHighWaterMark,
    readableSizeAlgorithm
  );

  // The [[backpressure]] slot is set to undefined so that it can be initialised by TransformStreamSetBackpressure.
  stream._backpressure = undefined!;
  stream._backpressureChangePromise = undefined!;
  stream._backpressureChangePromise_resolve = undefined!;
  TransformStreamSetBackpressure(stream, true);

  stream._transformStreamController = undefined!;
}

function IsTransformStream(x: unknown): x is TransformStream {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_transformStreamController')) {
    return false;
  }

  return x instanceof TransformStream;
}

// This is a no-op if both sides are already errored.
function TransformStreamError(stream: TransformStream, e: any) {
  ReadableStreamDefaultControllerError(stream, e);
  TransformStreamErrorWritableAndUnblockWrite(stream, e);
}

function TransformStreamErrorWritableAndUnblockWrite(stream: TransformStream, e: any) {
  TransformStreamDefaultControllerClearAlgorithms(stream._transformStreamController);
  WritableStreamDefaultControllerErrorIfNeeded(stream, e);
  if (stream._backpressure) {
    // Pretend that pull() was called to permit any pending write() calls to complete. TransformStreamSetBackpressure()
    // cannot be called from enqueue() or pull() once the ReadableStream is errored, so this will will be the final time
    // _backpressure is set.
    TransformStreamSetBackpressure(stream, false);
  }
}

function TransformStreamSetBackpressure(stream: TransformStream, backpressure: boolean) {
  // Passes also when called during construction.
  assert(stream._backpressure !== backpressure);

  if (stream._backpressureChangePromise !== undefined) {
    stream._backpressureChangePromise_resolve();
  }

  stream._backpressureChangePromise = newPromise(resolve => {
    stream._backpressureChangePromise_resolve = resolve;
  });

  stream._backpressure = backpressure;
}

// Class TransformStreamDefaultController

/**
 * Allows control of the {@link ReadableStream} and {@link WritableStream} of the associated {@link TransformStream}.
 *
 * @public
 */
export class TransformStreamDefaultController<O> {
  /** @internal */
  _controlledTransformStream: TransformStream<any, O>;
  /** @internal */
  _transformAlgorithm: (chunk: any) => Promise<void>;
  /** @internal */
  _flushAlgorithm: () => Promise<void>;

  private constructor() {
    throw new TypeError('Illegal constructor');
  }

  /**
   * Returns the desired size to fill the readable side’s internal queue. It can be negative, if the queue is over-full.
   */
  get desiredSize(): number | null {
    if (!IsTransformStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('desiredSize');
    }

    const stream = this._controlledTransformStream;
    return ReadableStreamDefaultControllerGetDesiredSize(stream);
  }

  /**
   * Enqueues the given chunk `chunk` in the readable side of the controlled transform stream.
   */
  enqueue(chunk: O): void;
  enqueue(chunk: O = undefined!): void {
    if (!IsTransformStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('enqueue');
    }

    TransformStreamDefaultControllerEnqueue(this, chunk);
  }

  /**
   * Errors both the readable side and the writable side of the controlled transform stream, making all future
   * interactions with it fail with the given error `e`. Any chunks queued for transformation will be discarded.
   */
  error(reason: any = undefined): void {
    if (!IsTransformStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('error');
    }

    TransformStreamDefaultControllerError(this, reason);
  }

  /**
   * Closes the readable side and errors the writable side of the controlled transform stream. This is useful when the
   * transformer only needs to consume a portion of the chunks written to the writable side.
   */
  terminate(): void {
    if (!IsTransformStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('terminate');
    }

    TransformStreamDefaultControllerTerminate(this);
  }
}

Object.defineProperties(TransformStreamDefaultController.prototype, {
  enqueue: { enumerable: true },
  error: { enumerable: true },
  terminate: { enumerable: true },
  desiredSize: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(TransformStreamDefaultController.prototype, Symbol.toStringTag, {
    value: 'TransformStreamDefaultController',
    configurable: true
  });
}

// Transform Stream Default Controller Abstract Operations

function IsTransformStreamDefaultController<O = any>(x: any): x is TransformStreamDefaultController<O> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledTransformStream')) {
    return false;
  }

  return x instanceof TransformStreamDefaultController;
}

function SetUpTransformStreamDefaultController<I, O>(stream: TransformStream<I, O>,
                                                     controller: TransformStreamDefaultController<O>,
                                                     transformAlgorithm: (chunk: I) => Promise<void>,
                                                     flushAlgorithm: () => Promise<void>) {
  assert(IsTransformStream(stream));
  assert(stream._transformStreamController === undefined);

  controller._controlledTransformStream = stream;
  stream._transformStreamController = controller;

  controller._transformAlgorithm = transformAlgorithm;
  controller._flushAlgorithm = flushAlgorithm;
}

function SetUpTransformStreamDefaultControllerFromTransformer<I, O>(stream: TransformStream<I, O>,
                                                                    transformer: ValidatedTransformer<I, O>) {
  const controller: TransformStreamDefaultController<O> = Object.create(TransformStreamDefaultController.prototype);

  let transformAlgorithm: (chunk: I) => Promise<void>;
  let flushAlgorithm: () => Promise<void>;

  if (transformer.transform !== undefined) {
    transformAlgorithm = chunk => transformer.transform!(chunk, controller);
  } else {
    transformAlgorithm = chunk => {
      try {
        TransformStreamDefaultControllerEnqueue(controller, chunk as unknown as O);
        return promiseResolvedWith(undefined);
      } catch (transformResultE) {
        return promiseRejectedWith(transformResultE);
      }
    };
  }

  if (transformer.flush !== undefined) {
    flushAlgorithm = () => transformer.flush!(controller);
  } else {
    flushAlgorithm = () => promiseResolvedWith(undefined);
  }

  SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm);
}

function TransformStreamDefaultControllerClearAlgorithms(controller: TransformStreamDefaultController<any>) {
  controller._transformAlgorithm = undefined!;
  controller._flushAlgorithm = undefined!;
}

function TransformStreamDefaultControllerEnqueue<O>(controller: TransformStreamDefaultController<O>, chunk: O) {
  const stream = controller._controlledTransformStream;
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(stream)) {
    throw new TypeError('Readable side is not in a state that permits enqueue');
  }

  // We throttle transform invocations based on the backpressure of the ReadableStream, but we still
  // accept TransformStreamDefaultControllerEnqueue() calls.

  try {
    ReadableStreamDefaultControllerEnqueue(stream, chunk);
  } catch (e) {
    // This happens when readableStrategy.size() throws.
    TransformStreamErrorWritableAndUnblockWrite(stream, e);

    throw stream._readableStoredError;
  }

  const backpressure = ReadableStreamDefaultControllerHasBackpressure(stream);
  if (backpressure !== stream._backpressure) {
    assert(backpressure);
    TransformStreamSetBackpressure(stream, true);
  }
}

function TransformStreamDefaultControllerError(controller: TransformStreamDefaultController<any>, e: any) {
  TransformStreamError(controller._controlledTransformStream, e);
}

function TransformStreamDefaultControllerPerformTransform<I, O>(controller: TransformStreamDefaultController<O>,
                                                                chunk: I) {
  const transformPromise = controller._transformAlgorithm(chunk);
  return transformPromiseWith(transformPromise, undefined, r => {
    TransformStreamError(controller._controlledTransformStream, r);
    throw r;
  });
}

function TransformStreamDefaultControllerTerminate<O>(controller: TransformStreamDefaultController<O>) {
  const stream = controller._controlledTransformStream;

  if (ReadableStreamDefaultControllerCanCloseOrEnqueue(stream)) {
    ReadableStreamDefaultControllerClose(stream);
  }

  const error = new TypeError('TransformStream terminated');
  TransformStreamErrorWritableAndUnblockWrite(stream, error);
}

// TransformStreamDefaultSink Algorithms

function TransformStreamDefaultSinkWriteAlgorithm<I, O>(stream: TransformStream<I, O>, chunk: I): Promise<void> {
  assert(stream._writableState === 'writable');

  const controller = stream._transformStreamController;

  if (stream._backpressure) {
    const backpressureChangePromise = stream._backpressureChangePromise;
    assert(backpressureChangePromise !== undefined);
    return transformPromiseWith(backpressureChangePromise, () => {
      const state = stream._writableState;
      if (state === 'erroring') {
        throw stream._writableStoredError;
      }
      assert(state === 'writable');
      return TransformStreamDefaultControllerPerformTransform<I, O>(controller, chunk);
    });
  }

  return TransformStreamDefaultControllerPerformTransform<I, O>(controller, chunk);
}

function TransformStreamDefaultSinkAbortAlgorithm(stream: TransformStream, reason: any): Promise<void> {
  // abort() is not called synchronously, so it is possible for abort() to be called when the stream is already
  // errored.
  TransformStreamError(stream, reason);
  return promiseResolvedWith(undefined);
}

function TransformStreamDefaultSinkCloseAlgorithm<I, O>(stream: TransformStream<I, O>): Promise<void> {
  const controller = stream._transformStreamController;
  const flushPromise = controller._flushAlgorithm();
  TransformStreamDefaultControllerClearAlgorithms(controller);

  // Return a promise that is fulfilled with undefined on success.
  return transformPromiseWith(flushPromise, () => {
    if (stream._readableState === 'errored') {
      throw stream._readableStoredError;
    }
    if (ReadableStreamDefaultControllerCanCloseOrEnqueue(stream)) {
      ReadableStreamDefaultControllerClose(stream);
    }
  }, r => {
    TransformStreamError(stream, r);
    throw stream._readableStoredError;
  });
}

// TransformStreamDefaultSource Algorithms

function TransformStreamDefaultSourcePullAlgorithm(stream: TransformStream): Promise<void> {
  // Invariant. Enforced by the promises returned by start() and pull().
  assert(stream._backpressure);

  assert(stream._backpressureChangePromise !== undefined);

  TransformStreamSetBackpressure(stream, false);

  // Prevent the next pull() call until there is backpressure.
  return stream._backpressureChangePromise;
}

// Helper functions for the TransformStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `TransformStreamDefaultController.prototype.${name} can only be used on a TransformStreamDefaultController`);
}

// Helper functions for the TransformStream.

function streamBrandCheckException(name: string): TypeError {
  return new TypeError(
    `TransformStream.prototype.${name} can only be used on a TransformStream`);
}
// Stubs for abstract operations used from ReadableStream and WritableStream.

function CreateReadableStream<R>(stream: TransformStream<any, R>,
                                 startAlgorithm: () => Promise<void>,
                                 pullAlgorithm: () => Promise<void>,
                                 cancelAlgorithm: (reason: any) => Promise<void>,
                                 highWaterMark: number,
                                 sizeAlgorithm: QueuingStrategySizeCallback<R>): ReadableStream<R> {
  return new ReadableStream<R>({
    start(controller) {
      stream._readableController = controller;
      return startAlgorithm().catch(e => {
        ReadableStreamDefaultControllerError(stream, e);
      });
    },
    pull() {
      assert(!stream._readablePulling);
      stream._readablePulling = true;
      return pullAlgorithm().catch(e => {
        ReadableStreamDefaultControllerError(stream, e);
      });
    },
    cancel(reason) {
      assert(stream._readableState === 'readable');
      stream._readableState = 'closed';
      ReadableStreamAssertState(stream);
      return cancelAlgorithm(reason);
    }
  }, { highWaterMark, size: sizeAlgorithm });
}

function ReadableStreamDefaultControllerCanCloseOrEnqueue(stream: TransformStream): boolean {
  return !stream._readableCloseRequested && stream._readableState === 'readable';
}

function ReadableStreamDefaultControllerClose(stream: TransformStream): void {
  assert(stream._readableState === 'readable');
  assert(!stream._readableCloseRequested);

  // This is incorrect: if there are still queued chunks, the stream remains 'readable' until they have been read.
  // Luckily, this does not matter for ReadableStreamDefaultControllerCanCloseOrEnqueue.
  stream._readableState = 'closed';
  stream._readableCloseRequested = true;

  stream._readableController.close();
  ReadableStreamAssertState(stream);
}

function ReadableStreamDefaultControllerEnqueue<R>(stream: TransformStream, chunk: R): void {
  // If there is backpressure, enqueue() will not call pull(), and stream._readablePulling will remain false.
  // If there is no backpressure, enqueue() will call pull() and change stream._readablePulling back to true.
  stream._readablePulling = false;

  try {
    stream._readableController.enqueue(chunk);
    ReadableStreamAssertState(stream);
  } catch (e) {
    ReadableStreamDefaultControllerError(stream, e);
    ReadableStreamAssertState(stream);
    throw e;
  }
}

function ReadableStreamDefaultControllerError(stream: TransformStream, e: any) {
  if (stream._readableState === 'readable') {
    stream._readableState = 'errored';
    stream._readableStoredError = e;
  }

  stream._readableController.error(e);
  ReadableStreamAssertState(stream);
}

function ReadableStreamDefaultControllerGetDesiredSize(stream: TransformStream): number | null {
  return stream._readableController.desiredSize;
}

function ReadableStreamDefaultControllerHasBackpressure(stream: TransformStream): boolean {
  return !ReadableStreamDefaultControllerShouldCallPull(stream);
}

function ReadableStreamDefaultControllerShouldCallPull(stream: TransformStream): boolean {
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(stream)) {
    return false;
  }

  // Instead of checking whether there are any pending read() requests, we check if pull() was called.
  // if (IsReadableStreamLocked(stream._readable) && ReadableStreamGetNumReadRequests(stream._readable) > 0) {
  if (stream._readablePulling) {
    return true;
  }

  const desiredSize = ReadableStreamDefaultControllerGetDesiredSize(stream);
  assert(desiredSize !== null);
  if (desiredSize! > 0) {
    return true;
  }

  return false;
}

function ReadableStreamAssertState(stream: TransformStream): void {
  if (DEBUG && IsReadableStream(stream._readable)) {
    const readable = stream._readable;
    const controller = stream._readableController;
    // If closeRequested = true, we cannot know if the readable stream's state is 'readable' or 'closed'.
    // This also means we cannot know whether readable.cancel() can still change the state to 'errored' or not.
    // Luckily, this does not matter for ReadableStreamDefaultControllerCanCloseOrEnqueue.
    if (!(controller._closeRequested && stream._readableCloseRequested)) {
      assert(readable._state === stream._readableState);
      assert(readable._storedError === stream._readableStoredError);
    }
    assert(controller._closeRequested === stream._readableCloseRequested);
  }
}

function CreateWritableStream<W>(stream: TransformStream<W, any>,
                                 startAlgorithm: () => Promise<void>,
                                 writeAlgorithm: (chunk: W) => Promise<void>,
                                 closeAlgorithm: () => Promise<void>,
                                 abortAlgorithm: (reason: any) => Promise<void>,
                                 highWaterMark: number,
                                 sizeAlgorithm: QueuingStrategySizeCallback<W>): WritableStream<W> {
  return new WritableStream({
    start(controller) {
      stream._writableController = controller;
      const abortSignal = controller.signal;
      if (abortSignal !== undefined) {
        // `controller.signal` must be supported in order to synchronously detect `writable.abort()` calls
        // when there are pending writes.
        abortSignal.addEventListener('abort', () => {
          assert(stream._writableState === 'writable' || stream._writableState === 'erroring');
          if (stream._writableState === 'writable') {
            stream._writableState = 'erroring';
            stream._writableStoredError = controller.abortReason;
          }
          WritableStreamAssertState(stream);
        });
      }
      return startAlgorithm().then(
        () => {
          assert(stream._writableState === 'writable' || stream._writableState === 'erroring');
          stream._writableStarted = true;
          WritableStreamDefaultControllerAdvanceQueueIfNeeded(stream);
        },
        r => {
          assert(stream._writableState === 'writable' || stream._writableState === 'erroring');
          stream._writableStarted = true;
          WritableStreamDealWithRejection(stream, r);
          throw r;
        }
      );
    },
    write(chunk) {
      WritableStreamMarkFirstWriteRequestInFlight(stream);
      return writeAlgorithm(chunk).then(
        () => {
          WritableStreamFinishInFlightWrite(stream);
          assert(stream._writableState === 'writable' || stream._writableState === 'erroring');
          WritableStreamDefaultControllerAdvanceQueueIfNeeded(stream);
        },
        reason => {
          WritableStreamFinishInFlightWriteWithError(stream, reason);
          throw reason;
        });
    },
    close() {
      WritableStreamMarkCloseRequestInFlight(stream);
      return closeAlgorithm().then(() => {
        WritableStreamFinishInFlightClose(stream);
      }, e => {
        WritableStreamFinishInFlightCloseWithError(stream, e);
        throw e;
      });
    },
    abort(reason) {
      stream._writableState = 'errored';
      stream._writableStoredError = reason;
      WritableStreamAssertState(stream);
      return abortAlgorithm(reason);
    }
  }, { highWaterMark, size: sizeAlgorithm });
}

function WritableStreamDealWithRejection(stream: TransformStream, error: any) {
  const state = stream._writableState;

  if (state === 'writable') {
    WritableStreamStartErroring(stream, error);
    return;
  }

  assert(state === 'erroring');
  WritableStreamFinishErroring(stream);
}

function WritableStreamStartErroring(stream: TransformStream, reason: any) {
  assert(stream._writableStoredError === undefined);
  assert(stream._writableState === 'writable');

  stream._writableState = 'erroring';
  stream._writableStoredError = reason;

  if (!WritableStreamHasOperationMarkedInFlight(stream) && stream._writableStarted) {
    WritableStreamFinishErroring(stream);
  }

  WritableStreamAssertState(stream);
}

function WritableStreamFinishErroring(stream: TransformStream) {
  assert(stream._writableState === 'erroring');
  assert(!WritableStreamHasOperationMarkedInFlight(stream));
  stream._writableState = 'errored';

  WritableStreamAssertState(stream);
}

function WritableStreamFinishInFlightWrite(stream: TransformStream) {
  assert(stream._writableHasInFlightOperation);
  stream._writableHasInFlightOperation = false;
}

function WritableStreamFinishInFlightWriteWithError(stream: TransformStream, error: any) {
  assert(stream._writableHasInFlightOperation);
  stream._writableHasInFlightOperation = false;

  assert(stream._writableState === 'writable' || stream._writableState === 'erroring');

  WritableStreamDealWithRejection(stream, error);
}

function WritableStreamFinishInFlightClose(stream: TransformStream) {
  assert(stream._writableHasInFlightOperation);
  stream._writableHasInFlightOperation = false;

  const state = stream._writableState;
  assert(state === 'writable' || state === 'erroring');

  if (state === 'erroring') {
    // The error was too late to do anything, so it is ignored.
    stream._writableStoredError = undefined;
  }

  stream._writableState = 'closed';

  assert(stream._writableStoredError === undefined);
  WritableStreamAssertState(stream);
}

function WritableStreamFinishInFlightCloseWithError(stream: TransformStream, error: any) {
  assert(stream._writableHasInFlightOperation);
  stream._writableHasInFlightOperation = false;

  const state = stream._writableState;

  assert(state === 'writable' || state === 'erroring');

  WritableStreamDealWithRejection(stream, error);
  WritableStreamAssertState(stream);
}

function WritableStreamHasOperationMarkedInFlight(stream: TransformStream): boolean {
  return stream._writableHasInFlightOperation;
}

function WritableStreamMarkCloseRequestInFlight(stream: TransformStream) {
  assert(!stream._writableHasInFlightOperation);
  stream._writableHasInFlightOperation = true;
}

function WritableStreamMarkFirstWriteRequestInFlight(stream: TransformStream) {
  assert(!stream._writableHasInFlightOperation);
  stream._writableHasInFlightOperation = true;
}

function WritableStreamDefaultControllerAdvanceQueueIfNeeded(stream: TransformStream) {
  const state = stream._writableState;
  assert(state !== 'closed' && state !== 'errored');
  if (state === 'erroring') {
    WritableStreamFinishErroring(stream);
  }
  WritableStreamAssertState(stream);
}

function WritableStreamDefaultControllerErrorIfNeeded(stream: TransformStream, error: any) {
  stream._writableController.error(error);

  const state = stream._writableState;
  if (state === 'writable') {
    WritableStreamStartErroring(stream, error);
  }
}

function WritableStreamAssertState(stream: TransformStream): void {
  if (DEBUG && IsWritableStream(stream._writable)) {
    // Check state asynchronously, because we update our state before we update the actual writable stream.
    setTimeout(() => {
      const writable = stream._writable as WritableStream;
      assert(writable._state === stream._writableState);
      assert(writable._storedError === stream._writableStoredError);
    }, 0);
  }
}
