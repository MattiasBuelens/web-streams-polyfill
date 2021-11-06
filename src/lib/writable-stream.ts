import assert from '../stub/assert';
import {
  newPromise,
  promiseRejectedWith,
  promiseResolvedWith,
  setPromiseIsHandledToTrue,
  uponPromise
} from './helpers/webidl';
import {
  DequeueValue,
  EnqueueValueWithSize,
  PeekQueueValue,
  QueuePair,
  ResetQueue
} from './abstract-ops/queue-with-sizes';
import { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import { SimpleQueue } from './simple-queue';
import { typeIsObject } from './helpers/miscellaneous';
import { AbortSteps, ErrorSteps } from './abstract-ops/internal-methods';
import { IsNonNegativeNumber } from './abstract-ops/miscellaneous';
import { ExtractHighWaterMark, ExtractSizeAlgorithm } from './abstract-ops/queuing-strategy';
import { convertQueuingStrategy } from './validators/queuing-strategy';
import {
  UnderlyingSink,
  UnderlyingSinkAbortCallback,
  UnderlyingSinkCloseCallback,
  UnderlyingSinkStartCallback,
  UnderlyingSinkWriteCallback,
  ValidatedUnderlyingSink
} from './writable-stream/underlying-sink';
import { assertObject, assertRequiredArgument } from './validators/basic';
import { convertUnderlyingSink } from './validators/underlying-sink';
import { assertWritableStream } from './validators/writable-stream';
import { AbortController, AbortSignal, createAbortController } from './abort-signal';

type WritableStreamState = 'writable' | 'closed' | 'erroring' | 'errored';

interface WriteOrCloseRequest {
  _resolve: (value?: undefined) => void;
  _reject: (reason: any) => void;
}

type WriteRequest = WriteOrCloseRequest;
type CloseRequest = WriteOrCloseRequest;

interface PendingAbortRequest {
  _promise: Promise<undefined>;
  _resolve: (value?: undefined) => void;
  _reject: (reason: any) => void;
  _reason: any;
  _wasAlreadyErroring: boolean;
}

/**
 * A writable stream represents a destination for data, into which you can write.
 *
 * @public
 */
class WritableStream<W = any> {
  /** @internal */
  _state!: WritableStreamState;
  /** @internal */
  _storedError: any;
  /** @internal */
  _writer: WritableStreamDefaultWriter<W> | undefined;
  /** @internal */
  _writableStreamController!: WritableStreamDefaultController<W>;
  /** @internal */
  _writeRequests!: SimpleQueue<WriteRequest>;
  /** @internal */
  _inFlightWriteRequest: WriteRequest | undefined;
  /** @internal */
  _closeRequest: CloseRequest | undefined;
  /** @internal */
  _inFlightCloseRequest: CloseRequest | undefined;
  /** @internal */
  _pendingAbortRequest: PendingAbortRequest | undefined;
  /** @internal */
  _backpressure!: boolean;

  constructor(underlyingSink?: UnderlyingSink<W>, strategy?: QueuingStrategy<W>);
  constructor(rawUnderlyingSink: UnderlyingSink<W> | null | undefined = {},
              rawStrategy: QueuingStrategy<W> | null | undefined = {}) {
    if (rawUnderlyingSink === undefined) {
      rawUnderlyingSink = null;
    } else {
      assertObject(rawUnderlyingSink, 'First parameter');
    }

    const strategy = convertQueuingStrategy(rawStrategy, 'Second parameter');
    const underlyingSink = convertUnderlyingSink(rawUnderlyingSink, 'First parameter');

    InitializeWritableStream(this);

    const type = underlyingSink.type;
    if (type !== undefined) {
      throw new RangeError('Invalid type is specified');
    }

    const sizeAlgorithm = ExtractSizeAlgorithm(strategy);
    const highWaterMark = ExtractHighWaterMark(strategy, 1);

    SetUpWritableStreamDefaultControllerFromUnderlyingSink(this, underlyingSink, highWaterMark, sizeAlgorithm);
  }

  /**
   * Returns whether or not the writable stream is locked to a writer.
   */
  get locked(): boolean {
    if (!IsWritableStream(this)) {
      throw streamBrandCheckException('locked');
    }

    return IsWritableStreamLocked(this);
  }

  /**
   * Aborts the stream, signaling that the producer can no longer successfully write to the stream and it is to be
   * immediately moved to an errored state, with any queued-up writes discarded. This will also execute any abort
   * mechanism of the underlying sink.
   *
   * The returned promise will fulfill if the stream shuts down successfully, or reject if the underlying sink signaled
   * that there was an error doing so. Additionally, it will reject with a `TypeError` (without attempting to cancel
   * the stream) if the stream is currently locked.
   */
  abort(reason: any = undefined): Promise<void> {
    if (!IsWritableStream(this)) {
      return promiseRejectedWith(streamBrandCheckException('abort'));
    }

    if (IsWritableStreamLocked(this)) {
      return promiseRejectedWith(new TypeError('Cannot abort a stream that already has a writer'));
    }

    return WritableStreamAbort(this, reason);
  }

  /**
   * Closes the stream. The underlying sink will finish processing any previously-written chunks, before invoking its
   * close behavior. During this time any further attempts to write will fail (without erroring the stream).
   *
   * The method returns a promise that will fulfill if all remaining chunks are successfully written and the stream
   * successfully closes, or rejects if an error is encountered during this process. Additionally, it will reject with
   * a `TypeError` (without attempting to cancel the stream) if the stream is currently locked.
   */
  close() {
    if (!IsWritableStream(this)) {
      return promiseRejectedWith(streamBrandCheckException('close'));
    }

    if (IsWritableStreamLocked(this)) {
      return promiseRejectedWith(new TypeError('Cannot close a stream that already has a writer'));
    }

    if (WritableStreamCloseQueuedOrInFlight(this)) {
      return promiseRejectedWith(new TypeError('Cannot close an already-closing stream'));
    }

    return WritableStreamClose(this);
  }

  /**
   * Creates a {@link WritableStreamDefaultWriter | writer} and locks the stream to the new writer. While the stream
   * is locked, no other writer can be acquired until this one is released.
   *
   * This functionality is especially useful for creating abstractions that desire the ability to write to a stream
   * without interruption or interleaving. By getting a writer for the stream, you can ensure nobody else can write at
   * the same time, which would cause the resulting written data to be unpredictable and probably useless.
   */
  getWriter(): WritableStreamDefaultWriter<W> {
    if (!IsWritableStream(this)) {
      throw streamBrandCheckException('getWriter');
    }

    return AcquireWritableStreamDefaultWriter(this);
  }
}

Object.defineProperties(WritableStream.prototype, {
  abort: { enumerable: true },
  close: { enumerable: true },
  getWriter: { enumerable: true },
  locked: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(WritableStream.prototype, Symbol.toStringTag, {
    value: 'WritableStream',
    configurable: true
  });
}

export {
  AcquireWritableStreamDefaultWriter,
  CreateWritableStream,
  IsWritableStream,
  IsWritableStreamLocked,
  WritableStream,
  WritableStreamAbort,
  WritableStreamDefaultControllerErrorIfNeeded,
  WritableStreamDefaultWriterCloseWithErrorPropagation,
  WritableStreamDefaultWriterRelease,
  WritableStreamDefaultWriterWrite,
  WritableStreamCloseQueuedOrInFlight,
  UnderlyingSink,
  UnderlyingSinkStartCallback,
  UnderlyingSinkWriteCallback,
  UnderlyingSinkCloseCallback,
  UnderlyingSinkAbortCallback
};

// Abstract operations for the WritableStream.

function AcquireWritableStreamDefaultWriter<W>(stream: WritableStream<W>): WritableStreamDefaultWriter<W> {
  return new WritableStreamDefaultWriter(stream);
}

// Throws if and only if startAlgorithm throws.
function CreateWritableStream<W>(startAlgorithm: () => void | PromiseLike<void>,
                                 writeAlgorithm: (chunk: W) => Promise<void>,
                                 closeAlgorithm: () => Promise<void>,
                                 abortAlgorithm: (reason: any) => Promise<void>,
                                 highWaterMark = 1,
                                 sizeAlgorithm: QueuingStrategySizeCallback<W> = () => 1) {
  assert(IsNonNegativeNumber(highWaterMark));

  const stream: WritableStream<W> = Object.create(WritableStream.prototype);
  InitializeWritableStream(stream);

  const controller: WritableStreamDefaultController<W> = Object.create(WritableStreamDefaultController.prototype);

  SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm,
                                       abortAlgorithm, highWaterMark, sizeAlgorithm);
  return stream;
}

function InitializeWritableStream<W>(stream: WritableStream<W>) {
  stream._state = 'writable';

  // The error that will be reported by new method calls once the state becomes errored. Only set when [[state]] is
  // 'erroring' or 'errored'. May be set to an undefined value.
  stream._storedError = undefined;

  stream._writer = undefined;

  // Initialize to undefined first because the constructor of the controller checks this
  // variable to validate the caller.
  stream._writableStreamController = undefined!;

  // This queue is placed here instead of the writer class in order to allow for passing a writer to the next data
  // producer without waiting for the queued writes to finish.
  stream._writeRequests = new SimpleQueue();

  // Write requests are removed from _writeRequests when write() is called on the underlying sink. This prevents
  // them from being erroneously rejected on error. If a write() call is in-flight, the request is stored here.
  stream._inFlightWriteRequest = undefined;

  // The promise that was returned from writer.close(). Stored here because it may be fulfilled after the writer
  // has been detached.
  stream._closeRequest = undefined;

  // Close request is removed from _closeRequest when close() is called on the underlying sink. This prevents it
  // from being erroneously rejected on error. If a close() call is in-flight, the request is stored here.
  stream._inFlightCloseRequest = undefined;

  // The promise that was returned from writer.abort(). This may also be fulfilled after the writer has detached.
  stream._pendingAbortRequest = undefined;

  // The backpressure signal set by the controller.
  stream._backpressure = false;
}

function IsWritableStream(x: unknown): x is WritableStream {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_writableStreamController')) {
    return false;
  }

  return x instanceof WritableStream;
}

function IsWritableStreamLocked(stream: WritableStream): boolean {
  assert(IsWritableStream(stream));

  if (stream._writer === undefined) {
    return false;
  }

  return true;
}

function WritableStreamAbort(stream: WritableStream, reason: any): Promise<undefined> {
  if (stream._state === 'closed' || stream._state === 'errored') {
    return promiseResolvedWith(undefined);
  }
  stream._writableStreamController._abortReason = reason;
  stream._writableStreamController._abortController?.abort();

  // TypeScript narrows the type of `stream._state` down to 'writable' | 'erroring',
  // but it doesn't know that signaling abort runs author code that might have changed the state.
  // Widen the type again by casting to WritableStreamState.
  const state = stream._state as WritableStreamState;

  if (state === 'closed' || state === 'errored') {
    return promiseResolvedWith(undefined);
  }
  if (stream._pendingAbortRequest !== undefined) {
    return stream._pendingAbortRequest._promise;
  }

  assert(state === 'writable' || state === 'erroring');

  let wasAlreadyErroring = false;
  if (state === 'erroring') {
    wasAlreadyErroring = true;
    // reason will not be used, so don't keep a reference to it.
    reason = undefined;
  }

  const promise = newPromise<undefined>((resolve, reject) => {
    stream._pendingAbortRequest = {
      _promise: undefined!,
      _resolve: resolve,
      _reject: reject,
      _reason: reason,
      _wasAlreadyErroring: wasAlreadyErroring
    };
  });
  stream._pendingAbortRequest!._promise = promise;

  if (!wasAlreadyErroring) {
    WritableStreamStartErroring(stream, reason);
  }

  return promise;
}

function WritableStreamClose(stream: WritableStream<any>): Promise<undefined> {
  const state = stream._state;
  if (state === 'closed' || state === 'errored') {
    return promiseRejectedWith(new TypeError(
      `The stream (in ${state} state) is not in the writable state and cannot be closed`));
  }

  assert(state === 'writable' || state === 'erroring');
  assert(!WritableStreamCloseQueuedOrInFlight(stream));

  const promise = newPromise<undefined>((resolve, reject) => {
    const closeRequest: CloseRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._closeRequest = closeRequest;
  });

  const writer = stream._writer;
  if (writer !== undefined && stream._backpressure && state === 'writable') {
    defaultWriterReadyPromiseResolve(writer);
  }

  WritableStreamDefaultControllerClose(stream._writableStreamController);

  return promise;
}

// WritableStream API exposed for controllers.

function WritableStreamAddWriteRequest(stream: WritableStream): Promise<undefined> {
  assert(IsWritableStreamLocked(stream));
  assert(stream._state === 'writable');

  const promise = newPromise<undefined>((resolve, reject) => {
    const writeRequest: WriteRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._writeRequests.push(writeRequest);
  });

  return promise;
}

function WritableStreamDealWithRejection(stream: WritableStream, error: any) {
  const state = stream._state;

  if (state === 'writable') {
    WritableStreamStartErroring(stream, error);
    return;
  }

  assert(state === 'erroring');
  WritableStreamFinishErroring(stream);
}

function WritableStreamStartErroring(stream: WritableStream, reason: any) {
  assert(stream._storedError === undefined);
  assert(stream._state === 'writable');

  const controller = stream._writableStreamController;
  assert(controller !== undefined);

  stream._state = 'erroring';
  stream._storedError = reason;
  const writer = stream._writer;
  if (writer !== undefined) {
    WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, reason);
  }

  if (!WritableStreamHasOperationMarkedInFlight(stream) && controller._started) {
    WritableStreamFinishErroring(stream);
  }
}

function WritableStreamFinishErroring(stream: WritableStream) {
  assert(stream._state === 'erroring');
  assert(!WritableStreamHasOperationMarkedInFlight(stream));
  stream._state = 'errored';
  stream._writableStreamController[ErrorSteps]();

  const storedError = stream._storedError;
  stream._writeRequests.forEach(writeRequest => {
    writeRequest._reject(storedError);
  });
  stream._writeRequests = new SimpleQueue();

  if (stream._pendingAbortRequest === undefined) {
    WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
    return;
  }

  const abortRequest = stream._pendingAbortRequest;
  stream._pendingAbortRequest = undefined;

  if (abortRequest._wasAlreadyErroring) {
    abortRequest._reject(storedError);
    WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
    return;
  }

  const promise = stream._writableStreamController[AbortSteps](abortRequest._reason);
  uponPromise(
    promise,
    () => {
      abortRequest._resolve();
      WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
    },
    (reason: any) => {
      abortRequest._reject(reason);
      WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
    });
}

function WritableStreamFinishInFlightWrite(stream: WritableStream) {
  assert(stream._inFlightWriteRequest !== undefined);
  stream._inFlightWriteRequest!._resolve(undefined);
  stream._inFlightWriteRequest = undefined;
}

function WritableStreamFinishInFlightWriteWithError(stream: WritableStream, error: any) {
  assert(stream._inFlightWriteRequest !== undefined);
  stream._inFlightWriteRequest!._reject(error);
  stream._inFlightWriteRequest = undefined;

  assert(stream._state === 'writable' || stream._state === 'erroring');

  WritableStreamDealWithRejection(stream, error);
}

function WritableStreamFinishInFlightClose(stream: WritableStream) {
  assert(stream._inFlightCloseRequest !== undefined);
  stream._inFlightCloseRequest!._resolve(undefined);
  stream._inFlightCloseRequest = undefined;

  const state = stream._state;

  assert(state === 'writable' || state === 'erroring');

  if (state === 'erroring') {
    // The error was too late to do anything, so it is ignored.
    stream._storedError = undefined;
    if (stream._pendingAbortRequest !== undefined) {
      stream._pendingAbortRequest._resolve();
      stream._pendingAbortRequest = undefined;
    }
  }

  stream._state = 'closed';

  const writer = stream._writer;
  if (writer !== undefined) {
    defaultWriterClosedPromiseResolve(writer);
  }

  assert(stream._pendingAbortRequest === undefined);
  assert(stream._storedError === undefined);
}

function WritableStreamFinishInFlightCloseWithError(stream: WritableStream, error: any) {
  assert(stream._inFlightCloseRequest !== undefined);
  stream._inFlightCloseRequest!._reject(error);
  stream._inFlightCloseRequest = undefined;

  assert(stream._state === 'writable' || stream._state === 'erroring');

  // Never execute sink abort() after sink close().
  if (stream._pendingAbortRequest !== undefined) {
    stream._pendingAbortRequest._reject(error);
    stream._pendingAbortRequest = undefined;
  }
  WritableStreamDealWithRejection(stream, error);
}

// TODO(ricea): Fix alphabetical order.
function WritableStreamCloseQueuedOrInFlight(stream: WritableStream): boolean {
  if (stream._closeRequest === undefined && stream._inFlightCloseRequest === undefined) {
    return false;
  }

  return true;
}

function WritableStreamHasOperationMarkedInFlight(stream: WritableStream): boolean {
  if (stream._inFlightWriteRequest === undefined && stream._inFlightCloseRequest === undefined) {
    return false;
  }

  return true;
}

function WritableStreamMarkCloseRequestInFlight(stream: WritableStream) {
  assert(stream._inFlightCloseRequest === undefined);
  assert(stream._closeRequest !== undefined);
  stream._inFlightCloseRequest = stream._closeRequest;
  stream._closeRequest = undefined;
}

function WritableStreamMarkFirstWriteRequestInFlight(stream: WritableStream) {
  assert(stream._inFlightWriteRequest === undefined);
  assert(stream._writeRequests.length !== 0);
  stream._inFlightWriteRequest = stream._writeRequests.shift();
}

function WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream: WritableStream) {
  assert(stream._state === 'errored');
  if (stream._closeRequest !== undefined) {
    assert(stream._inFlightCloseRequest === undefined);

    stream._closeRequest._reject(stream._storedError);
    stream._closeRequest = undefined;
  }
  const writer = stream._writer;
  if (writer !== undefined) {
    defaultWriterClosedPromiseReject(writer, stream._storedError);
  }
}

function WritableStreamUpdateBackpressure(stream: WritableStream, backpressure: boolean) {
  assert(stream._state === 'writable');
  assert(!WritableStreamCloseQueuedOrInFlight(stream));

  const writer = stream._writer;
  if (writer !== undefined && backpressure !== stream._backpressure) {
    if (backpressure) {
      defaultWriterReadyPromiseReset(writer);
    } else {
      assert(!backpressure);

      defaultWriterReadyPromiseResolve(writer);
    }
  }

  stream._backpressure = backpressure;
}

/**
 * A default writer vended by a {@link WritableStream}.
 *
 * @public
 */
export class WritableStreamDefaultWriter<W = any> {
  /** @internal */
  _ownerWritableStream: WritableStream<W>;
  /** @internal */
  _closedPromise!: Promise<undefined>;
  /** @internal */
  _closedPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _closedPromise_reject?: (reason: any) => void;
  /** @internal */
  _closedPromiseState!: 'pending' | 'resolved' | 'rejected';
  /** @internal */
  _readyPromise!: Promise<undefined>;
  /** @internal */
  _readyPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _readyPromise_reject?: (reason: any) => void;
  /** @internal */
  _readyPromiseState!: 'pending' | 'fulfilled' | 'rejected';

  constructor(stream: WritableStream<W>) {
    assertRequiredArgument(stream, 1, 'WritableStreamDefaultWriter');
    assertWritableStream(stream, 'First parameter');

    if (IsWritableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive writing by another writer');
    }

    this._ownerWritableStream = stream;
    stream._writer = this;

    const state = stream._state;

    if (state === 'writable') {
      if (!WritableStreamCloseQueuedOrInFlight(stream) && stream._backpressure) {
        defaultWriterReadyPromiseInitialize(this);
      } else {
        defaultWriterReadyPromiseInitializeAsResolved(this);
      }

      defaultWriterClosedPromiseInitialize(this);
    } else if (state === 'erroring') {
      defaultWriterReadyPromiseInitializeAsRejected(this, stream._storedError);
      defaultWriterClosedPromiseInitialize(this);
    } else if (state === 'closed') {
      defaultWriterReadyPromiseInitializeAsResolved(this);
      defaultWriterClosedPromiseInitializeAsResolved(this);
    } else {
      assert(state === 'errored');

      const storedError = stream._storedError;
      defaultWriterReadyPromiseInitializeAsRejected(this, storedError);
      defaultWriterClosedPromiseInitializeAsRejected(this, storedError);
    }
  }

  /**
   * Returns a promise that will be fulfilled when the stream becomes closed, or rejected if the stream ever errors or
   * the writer’s lock is released before the stream finishes closing.
   */
  get closed(): Promise<undefined> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return promiseRejectedWith(defaultWriterBrandCheckException('closed'));
    }

    return this._closedPromise;
  }

  /**
   * Returns the desired size to fill the stream’s internal queue. It can be negative, if the queue is over-full.
   * A producer can use this information to determine the right amount of data to write.
   *
   * It will be `null` if the stream cannot be successfully written to (due to either being errored, or having an abort
   * queued up). It will return zero if the stream is closed. And the getter will throw an exception if invoked when
   * the writer’s lock is released.
   */
  get desiredSize(): number | null {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw defaultWriterBrandCheckException('desiredSize');
    }

    if (this._ownerWritableStream === undefined) {
      throw defaultWriterLockException('desiredSize');
    }

    return WritableStreamDefaultWriterGetDesiredSize(this);
  }

  /**
   * Returns a promise that will be fulfilled when the desired size to fill the stream’s internal queue transitions
   * from non-positive to positive, signaling that it is no longer applying backpressure. Once the desired size dips
   * back to zero or below, the getter will return a new promise that stays pending until the next transition.
   *
   * If the stream becomes errored or aborted, or the writer’s lock is released, the returned promise will become
   * rejected.
   */
  get ready(): Promise<undefined> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return promiseRejectedWith(defaultWriterBrandCheckException('ready'));
    }

    return this._readyPromise;
  }

  /**
   * If the reader is active, behaves the same as {@link WritableStream.abort | stream.abort(reason)}.
   */
  abort(reason: any = undefined): Promise<void> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return promiseRejectedWith(defaultWriterBrandCheckException('abort'));
    }

    if (this._ownerWritableStream === undefined) {
      return promiseRejectedWith(defaultWriterLockException('abort'));
    }

    return WritableStreamDefaultWriterAbort(this, reason);
  }

  /**
   * If the reader is active, behaves the same as {@link WritableStream.close | stream.close()}.
   */
  close(): Promise<void> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return promiseRejectedWith(defaultWriterBrandCheckException('close'));
    }

    const stream = this._ownerWritableStream;

    if (stream === undefined) {
      return promiseRejectedWith(defaultWriterLockException('close'));
    }

    if (WritableStreamCloseQueuedOrInFlight(stream)) {
      return promiseRejectedWith(new TypeError('Cannot close an already-closing stream'));
    }

    return WritableStreamDefaultWriterClose(this);
  }

  /**
   * Releases the writer’s lock on the corresponding stream. After the lock is released, the writer is no longer active.
   * If the associated stream is errored when the lock is released, the writer will appear errored in the same way from
   * now on; otherwise, the writer will appear closed.
   *
   * Note that the lock can still be released even if some ongoing writes have not yet finished (i.e. even if the
   * promises returned from previous calls to {@link WritableStreamDefaultWriter.write | write()} have not yet settled).
   * It’s not necessary to hold the lock on the writer for the duration of the write; the lock instead simply prevents
   * other producers from writing in an interleaved manner.
   */
  releaseLock(): void {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw defaultWriterBrandCheckException('releaseLock');
    }

    const stream = this._ownerWritableStream;

    if (stream === undefined) {
      return;
    }

    assert(stream._writer !== undefined);

    WritableStreamDefaultWriterRelease(this);
  }

  /**
   * Writes the given chunk to the writable stream, by waiting until any previous writes have finished successfully,
   * and then sending the chunk to the underlying sink's {@link UnderlyingSink.write | write()} method. It will return
   * a promise that fulfills with undefined upon a successful write, or rejects if the write fails or stream becomes
   * errored before the writing process is initiated.
   *
   * Note that what "success" means is up to the underlying sink; it might indicate simply that the chunk has been
   * accepted, and not necessarily that it is safely saved to its ultimate destination.
   */
  write(chunk: W): Promise<void>;
  write(chunk: W = undefined!): Promise<void> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return promiseRejectedWith(defaultWriterBrandCheckException('write'));
    }

    if (this._ownerWritableStream === undefined) {
      return promiseRejectedWith(defaultWriterLockException('write to'));
    }

    return WritableStreamDefaultWriterWrite(this, chunk);
  }
}

Object.defineProperties(WritableStreamDefaultWriter.prototype, {
  abort: { enumerable: true },
  close: { enumerable: true },
  releaseLock: { enumerable: true },
  write: { enumerable: true },
  closed: { enumerable: true },
  desiredSize: { enumerable: true },
  ready: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(WritableStreamDefaultWriter.prototype, Symbol.toStringTag, {
    value: 'WritableStreamDefaultWriter',
    configurable: true
  });
}

// Abstract operations for the WritableStreamDefaultWriter.

function IsWritableStreamDefaultWriter<W = any>(x: any): x is WritableStreamDefaultWriter<W> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_ownerWritableStream')) {
    return false;
  }

  return x instanceof WritableStreamDefaultWriter;
}

// A client of WritableStreamDefaultWriter may use these functions directly to bypass state check.

function WritableStreamDefaultWriterAbort(writer: WritableStreamDefaultWriter, reason: any) {
  const stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  return WritableStreamAbort(stream, reason);
}

function WritableStreamDefaultWriterClose(writer: WritableStreamDefaultWriter): Promise<undefined> {
  const stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  return WritableStreamClose(stream);
}

function WritableStreamDefaultWriterCloseWithErrorPropagation(writer: WritableStreamDefaultWriter): Promise<undefined> {
  const stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  const state = stream._state;
  if (WritableStreamCloseQueuedOrInFlight(stream) || state === 'closed') {
    return promiseResolvedWith(undefined);
  }

  if (state === 'errored') {
    return promiseRejectedWith(stream._storedError);
  }

  assert(state === 'writable' || state === 'erroring');

  return WritableStreamDefaultWriterClose(writer);
}

function WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer: WritableStreamDefaultWriter, error: any) {
  if (writer._closedPromiseState === 'pending') {
    defaultWriterClosedPromiseReject(writer, error);
  } else {
    defaultWriterClosedPromiseResetToRejected(writer, error);
  }
}

function WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer: WritableStreamDefaultWriter, error: any) {
  if (writer._readyPromiseState === 'pending') {
    defaultWriterReadyPromiseReject(writer, error);
  } else {
    defaultWriterReadyPromiseResetToRejected(writer, error);
  }
}

function WritableStreamDefaultWriterGetDesiredSize(writer: WritableStreamDefaultWriter): number | null {
  const stream = writer._ownerWritableStream;
  const state = stream._state;

  if (state === 'errored' || state === 'erroring') {
    return null;
  }

  if (state === 'closed') {
    return 0;
  }

  return WritableStreamDefaultControllerGetDesiredSize(stream._writableStreamController);
}

function WritableStreamDefaultWriterRelease(writer: WritableStreamDefaultWriter) {
  const stream = writer._ownerWritableStream;
  assert(stream !== undefined);
  assert(stream._writer === writer);

  const releasedError = new TypeError(
    `Writer was released and can no longer be used to monitor the stream's closedness`);

  WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, releasedError);

  // The state transitions to "errored" before the sink abort() method runs, but the writer.closed promise is not
  // rejected until afterwards. This means that simply testing state will not work.
  WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, releasedError);

  stream._writer = undefined;
  writer._ownerWritableStream = undefined!;
}

function WritableStreamDefaultWriterWrite<W>(writer: WritableStreamDefaultWriter<W>, chunk: W): Promise<undefined> {
  const stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  const controller = stream._writableStreamController;

  const chunkSize = WritableStreamDefaultControllerGetChunkSize(controller, chunk);

  if (stream !== writer._ownerWritableStream) {
    return promiseRejectedWith(defaultWriterLockException('write to'));
  }

  const state = stream._state;
  if (state === 'errored') {
    return promiseRejectedWith(stream._storedError);
  }
  if (WritableStreamCloseQueuedOrInFlight(stream) || state === 'closed') {
    return promiseRejectedWith(new TypeError('The stream is closing or closed and cannot be written to'));
  }
  if (state === 'erroring') {
    return promiseRejectedWith(stream._storedError);
  }

  assert(state === 'writable');

  const promise = WritableStreamAddWriteRequest(stream);

  WritableStreamDefaultControllerWrite(controller, chunk, chunkSize);

  return promise;
}

const closeSentinel: unique symbol = {} as any;

type QueueRecord<W> = W | typeof closeSentinel;

/**
 * Allows control of a {@link WritableStream | writable stream}'s state and internal queue.
 *
 * @public
 */
export class WritableStreamDefaultController<W = any> {
  /** @internal */
  _controlledWritableStream!: WritableStream<W>;
  /** @internal */
  _queue!: SimpleQueue<QueuePair<QueueRecord<W>>>;
  /** @internal */
  _queueTotalSize!: number;
  /** @internal */
  _abortReason: any;
  /** @internal */
  _abortController: AbortController | undefined;
  /** @internal */
  _started!: boolean;
  /** @internal */
  _strategySizeAlgorithm!: QueuingStrategySizeCallback<W>;
  /** @internal */
  _strategyHWM!: number;
  /** @internal */
  _writeAlgorithm!: (chunk: W) => Promise<void>;
  /** @internal */
  _closeAlgorithm!: () => Promise<void>;
  /** @internal */
  _abortAlgorithm!: (reason: any) => Promise<void>;

  private constructor() {
    throw new TypeError('Illegal constructor');
  }

  /**
   * The reason which was passed to `WritableStream.abort(reason)` when the stream was aborted.
   *
   * @deprecated
   *  This property has been removed from the specification, see https://github.com/whatwg/streams/pull/1177.
   *  Use {@link WritableStreamDefaultController.signal}'s `reason` instead.
   */
  get abortReason(): any {
    if (!IsWritableStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('abortReason');
    }
    return this._abortReason;
  }

  /**
   * An `AbortSignal` that can be used to abort the pending write or close operation when the stream is aborted.
   */
  get signal(): AbortSignal {
    if (!IsWritableStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('signal');
    }
    if (this._abortController === undefined) {
      // Older browsers or older Node versions may not support `AbortController` or `AbortSignal`.
      // We don't want to bundle and ship an `AbortController` polyfill together with our polyfill,
      // so instead we only implement support for `signal` if we find a global `AbortController` constructor.
      throw new TypeError('WritableStreamDefaultController.prototype.signal is not supported');
    }
    return this._abortController.signal;
  }

  /**
   * Closes the controlled writable stream, making all future interactions with it fail with the given error `e`.
   *
   * This method is rarely used, since usually it suffices to return a rejected promise from one of the underlying
   * sink's methods. However, it can be useful for suddenly shutting down a stream in response to an event outside the
   * normal lifecycle of interactions with the underlying sink.
   */
  error(e: any = undefined): void {
    if (!IsWritableStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('error');
    }
    const state = this._controlledWritableStream._state;
    if (state !== 'writable') {
      // The stream is closed, errored or will be soon. The sink can't do anything useful if it gets an error here, so
      // just treat it as a no-op.
      return;
    }

    WritableStreamDefaultControllerError(this, e);
  }

  /** @internal */
  [AbortSteps](reason: any): Promise<void> {
    const result = this._abortAlgorithm(reason);
    WritableStreamDefaultControllerClearAlgorithms(this);
    return result;
  }

  /** @internal */
  [ErrorSteps]() {
    ResetQueue(this);
  }
}

Object.defineProperties(WritableStreamDefaultController.prototype, {
  abortReason: { enumerable: true },
  signal: { enumerable: true },
  error: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(WritableStreamDefaultController.prototype, Symbol.toStringTag, {
    value: 'WritableStreamDefaultController',
    configurable: true
  });
}

// Abstract operations implementing interface required by the WritableStream.

function IsWritableStreamDefaultController(x: any): x is WritableStreamDefaultController<any> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledWritableStream')) {
    return false;
  }

  return x instanceof WritableStreamDefaultController;
}

function SetUpWritableStreamDefaultController<W>(stream: WritableStream<W>,
                                                 controller: WritableStreamDefaultController<W>,
                                                 startAlgorithm: () => void | PromiseLike<void>,
                                                 writeAlgorithm: (chunk: W) => Promise<void>,
                                                 closeAlgorithm: () => Promise<void>,
                                                 abortAlgorithm: (reason: any) => Promise<void>,
                                                 highWaterMark: number,
                                                 sizeAlgorithm: QueuingStrategySizeCallback<W>) {
  assert(IsWritableStream(stream));
  assert(stream._writableStreamController === undefined);

  controller._controlledWritableStream = stream;
  stream._writableStreamController = controller;

  // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
  controller._queue = undefined!;
  controller._queueTotalSize = undefined!;
  ResetQueue(controller);

  controller._abortReason = undefined;
  controller._abortController = createAbortController();
  controller._started = false;

  controller._strategySizeAlgorithm = sizeAlgorithm;
  controller._strategyHWM = highWaterMark;

  controller._writeAlgorithm = writeAlgorithm;
  controller._closeAlgorithm = closeAlgorithm;
  controller._abortAlgorithm = abortAlgorithm;

  const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
  WritableStreamUpdateBackpressure(stream, backpressure);

  const startResult = startAlgorithm();
  const startPromise = promiseResolvedWith(startResult);
  uponPromise(
    startPromise,
    () => {
      assert(stream._state === 'writable' || stream._state === 'erroring');
      controller._started = true;
      WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
    },
    r => {
      assert(stream._state === 'writable' || stream._state === 'erroring');
      controller._started = true;
      WritableStreamDealWithRejection(stream, r);
    }
  );
}

function SetUpWritableStreamDefaultControllerFromUnderlyingSink<W>(stream: WritableStream<W>,
                                                                   underlyingSink: ValidatedUnderlyingSink<W>,
                                                                   highWaterMark: number,
                                                                   sizeAlgorithm: QueuingStrategySizeCallback<W>) {
  const controller = Object.create(WritableStreamDefaultController.prototype);

  let startAlgorithm: () => void | PromiseLike<void> = () => undefined;
  let writeAlgorithm: (chunk: W) => Promise<void> = () => promiseResolvedWith(undefined);
  let closeAlgorithm: () => Promise<void> = () => promiseResolvedWith(undefined);
  let abortAlgorithm: (reason: any) => Promise<void> = () => promiseResolvedWith(undefined);

  if (underlyingSink.start !== undefined) {
    startAlgorithm = () => underlyingSink.start!(controller);
  }
  if (underlyingSink.write !== undefined) {
    writeAlgorithm = chunk => underlyingSink.write!(chunk, controller);
  }
  if (underlyingSink.close !== undefined) {
    closeAlgorithm = () => underlyingSink.close!();
  }
  if (underlyingSink.abort !== undefined) {
    abortAlgorithm = reason => underlyingSink.abort!(reason);
  }

  SetUpWritableStreamDefaultController(
    stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm
  );
}

// ClearAlgorithms may be called twice. Erroring the same stream in multiple ways will often result in redundant calls.
function WritableStreamDefaultControllerClearAlgorithms(controller: WritableStreamDefaultController<any>) {
  controller._writeAlgorithm = undefined!;
  controller._closeAlgorithm = undefined!;
  controller._abortAlgorithm = undefined!;
  controller._strategySizeAlgorithm = undefined!;
}

function WritableStreamDefaultControllerClose<W>(controller: WritableStreamDefaultController<W>) {
  EnqueueValueWithSize(controller, closeSentinel, 0);
  WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
}

function WritableStreamDefaultControllerGetChunkSize<W>(controller: WritableStreamDefaultController<W>,
                                                        chunk: W): number {
  try {
    return controller._strategySizeAlgorithm(chunk);
  } catch (chunkSizeE) {
    WritableStreamDefaultControllerErrorIfNeeded(controller, chunkSizeE);
    return 1;
  }
}

function WritableStreamDefaultControllerGetDesiredSize(controller: WritableStreamDefaultController<any>): number {
  return controller._strategyHWM - controller._queueTotalSize;
}

function WritableStreamDefaultControllerWrite<W>(controller: WritableStreamDefaultController<W>,
                                                 chunk: W,
                                                 chunkSize: number) {
  try {
    EnqueueValueWithSize(controller, chunk, chunkSize);
  } catch (enqueueE) {
    WritableStreamDefaultControllerErrorIfNeeded(controller, enqueueE);
    return;
  }

  const stream = controller._controlledWritableStream;
  if (!WritableStreamCloseQueuedOrInFlight(stream) && stream._state === 'writable') {
    const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
    WritableStreamUpdateBackpressure(stream, backpressure);
  }

  WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
}

// Abstract operations for the WritableStreamDefaultController.

function WritableStreamDefaultControllerAdvanceQueueIfNeeded<W>(controller: WritableStreamDefaultController<W>) {
  const stream = controller._controlledWritableStream;

  if (!controller._started) {
    return;
  }

  if (stream._inFlightWriteRequest !== undefined) {
    return;
  }

  const state = stream._state;
  assert(state !== 'closed' && state !== 'errored');
  if (state === 'erroring') {
    WritableStreamFinishErroring(stream);
    return;
  }

  if (controller._queue.length === 0) {
    return;
  }

  const value = PeekQueueValue(controller);
  if (value === closeSentinel) {
    WritableStreamDefaultControllerProcessClose(controller);
  } else {
    WritableStreamDefaultControllerProcessWrite(controller, value);
  }
}

function WritableStreamDefaultControllerErrorIfNeeded(controller: WritableStreamDefaultController<any>, error: any) {
  if (controller._controlledWritableStream._state === 'writable') {
    WritableStreamDefaultControllerError(controller, error);
  }
}

function WritableStreamDefaultControllerProcessClose(controller: WritableStreamDefaultController<any>) {
  const stream = controller._controlledWritableStream;

  WritableStreamMarkCloseRequestInFlight(stream);

  DequeueValue(controller);
  assert(controller._queue.length === 0);

  const sinkClosePromise = controller._closeAlgorithm();
  WritableStreamDefaultControllerClearAlgorithms(controller);
  uponPromise(
    sinkClosePromise,
    () => {
      WritableStreamFinishInFlightClose(stream);
    },
    reason => {
      WritableStreamFinishInFlightCloseWithError(stream, reason);
    }
  );
}

function WritableStreamDefaultControllerProcessWrite<W>(controller: WritableStreamDefaultController<W>, chunk: W) {
  const stream = controller._controlledWritableStream;

  WritableStreamMarkFirstWriteRequestInFlight(stream);

  const sinkWritePromise = controller._writeAlgorithm(chunk);
  uponPromise(
    sinkWritePromise,
    () => {
      WritableStreamFinishInFlightWrite(stream);

      const state = stream._state;
      assert(state === 'writable' || state === 'erroring');

      DequeueValue(controller);

      if (!WritableStreamCloseQueuedOrInFlight(stream) && state === 'writable') {
        const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
        WritableStreamUpdateBackpressure(stream, backpressure);
      }

      WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
    },
    reason => {
      if (stream._state === 'writable') {
        WritableStreamDefaultControllerClearAlgorithms(controller);
      }
      WritableStreamFinishInFlightWriteWithError(stream, reason);
    }
  );
}

function WritableStreamDefaultControllerGetBackpressure(controller: WritableStreamDefaultController<any>): boolean {
  const desiredSize = WritableStreamDefaultControllerGetDesiredSize(controller);
  return desiredSize <= 0;
}

// A client of WritableStreamDefaultController may use these functions directly to bypass state check.

function WritableStreamDefaultControllerError(controller: WritableStreamDefaultController<any>, error: any) {
  const stream = controller._controlledWritableStream;

  assert(stream._state === 'writable');

  WritableStreamDefaultControllerClearAlgorithms(controller);
  WritableStreamStartErroring(stream, error);
}

// Helper functions for the WritableStream.

function streamBrandCheckException(name: string): TypeError {
  return new TypeError(`WritableStream.prototype.${name} can only be used on a WritableStream`);
}

// Helper functions for the WritableStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `WritableStreamDefaultController.prototype.${name} can only be used on a WritableStreamDefaultController`);
}


// Helper functions for the WritableStreamDefaultWriter.

function defaultWriterBrandCheckException(name: string): TypeError {
  return new TypeError(
    `WritableStreamDefaultWriter.prototype.${name} can only be used on a WritableStreamDefaultWriter`);
}

function defaultWriterLockException(name: string): TypeError {
  return new TypeError('Cannot ' + name + ' a stream using a released writer');
}

function defaultWriterClosedPromiseInitialize(writer: WritableStreamDefaultWriter) {
  writer._closedPromise = newPromise((resolve, reject) => {
    writer._closedPromise_resolve = resolve;
    writer._closedPromise_reject = reject;
    writer._closedPromiseState = 'pending';
  });
}

function defaultWriterClosedPromiseInitializeAsRejected(writer: WritableStreamDefaultWriter, reason: any) {
  defaultWriterClosedPromiseInitialize(writer);
  defaultWriterClosedPromiseReject(writer, reason);
}

function defaultWriterClosedPromiseInitializeAsResolved(writer: WritableStreamDefaultWriter) {
  defaultWriterClosedPromiseInitialize(writer);
  defaultWriterClosedPromiseResolve(writer);
}

function defaultWriterClosedPromiseReject(writer: WritableStreamDefaultWriter, reason: any) {
  if (writer._closedPromise_reject === undefined) {
    return;
  }
  assert(writer._closedPromiseState === 'pending');

  setPromiseIsHandledToTrue(writer._closedPromise);
  writer._closedPromise_reject(reason);
  writer._closedPromise_resolve = undefined;
  writer._closedPromise_reject = undefined;
  writer._closedPromiseState = 'rejected';
}

function defaultWriterClosedPromiseResetToRejected(writer: WritableStreamDefaultWriter, reason: any) {
  assert(writer._closedPromise_resolve === undefined);
  assert(writer._closedPromise_reject === undefined);
  assert(writer._closedPromiseState !== 'pending');

  defaultWriterClosedPromiseInitializeAsRejected(writer, reason);
}

function defaultWriterClosedPromiseResolve(writer: WritableStreamDefaultWriter) {
  if (writer._closedPromise_resolve === undefined) {
    return;
  }
  assert(writer._closedPromiseState === 'pending');

  writer._closedPromise_resolve(undefined);
  writer._closedPromise_resolve = undefined;
  writer._closedPromise_reject = undefined;
  writer._closedPromiseState = 'resolved';
}

function defaultWriterReadyPromiseInitialize(writer: WritableStreamDefaultWriter) {
  writer._readyPromise = newPromise((resolve, reject) => {
    writer._readyPromise_resolve = resolve;
    writer._readyPromise_reject = reject;
  });
  writer._readyPromiseState = 'pending';
}

function defaultWriterReadyPromiseInitializeAsRejected(writer: WritableStreamDefaultWriter, reason: any) {
  defaultWriterReadyPromiseInitialize(writer);
  defaultWriterReadyPromiseReject(writer, reason);
}

function defaultWriterReadyPromiseInitializeAsResolved(writer: WritableStreamDefaultWriter) {
  defaultWriterReadyPromiseInitialize(writer);
  defaultWriterReadyPromiseResolve(writer);
}

function defaultWriterReadyPromiseReject(writer: WritableStreamDefaultWriter, reason: any) {
  if (writer._readyPromise_reject === undefined) {
    return;
  }

  setPromiseIsHandledToTrue(writer._readyPromise);
  writer._readyPromise_reject(reason);
  writer._readyPromise_resolve = undefined;
  writer._readyPromise_reject = undefined;
  writer._readyPromiseState = 'rejected';
}

function defaultWriterReadyPromiseReset(writer: WritableStreamDefaultWriter) {
  assert(writer._readyPromise_resolve === undefined);
  assert(writer._readyPromise_reject === undefined);

  defaultWriterReadyPromiseInitialize(writer);
}

function defaultWriterReadyPromiseResetToRejected(writer: WritableStreamDefaultWriter, reason: any) {
  assert(writer._readyPromise_resolve === undefined);
  assert(writer._readyPromise_reject === undefined);

  defaultWriterReadyPromiseInitializeAsRejected(writer, reason);
}

function defaultWriterReadyPromiseResolve(writer: WritableStreamDefaultWriter) {
  if (writer._readyPromise_resolve === undefined) {
    return;
  }

  writer._readyPromise_resolve(undefined);
  writer._readyPromise_resolve = undefined;
  writer._readyPromise_reject = undefined;
  writer._readyPromiseState = 'fulfilled';
}
