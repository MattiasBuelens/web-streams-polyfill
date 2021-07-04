import { QueuingStrategySizeCallback } from '../queuing-strategy';
import assert from '../../stub/assert';
import { DequeueValue, EnqueueValueWithSize, QueuePair, ResetQueue } from '../abstract-ops/queue-with-sizes';
import {
  ReadableStreamAddReadRequest,
  ReadableStreamFulfillReadRequest,
  ReadableStreamGetNumReadRequests,
  ReadRequest
} from './default-reader';
import { SimpleQueue } from '../simple-queue';
import { IsReadableStreamLocked, ReadableStream, ReadableStreamClose, ReadableStreamError } from '../readable-stream';
import { ValidatedUnderlyingSource } from './underlying-source';
import { typeIsObject } from '../helpers/miscellaneous';
import { CancelSteps, PullSteps } from '../abstract-ops/internal-methods';
import { promiseResolvedWith, uponPromise } from '../helpers/webidl';

/**
 * Allows control of a {@link ReadableStream | readable stream}'s state and internal queue.
 *
 * @public
 */
export class ReadableStreamDefaultController<R> {
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

  private constructor() {
    throw new TypeError('Illegal constructor');
  }

  /**
   * Returns the desired size to fill the controlled stream's internal queue. It can be negative, if the queue is
   * over-full. An underlying source ought to use this information to determine when and how to apply backpressure.
   */
  get desiredSize(): number | null {
    if (!IsReadableStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('desiredSize');
    }

    return ReadableStreamDefaultControllerGetDesiredSize(this);
  }

  /**
   * Closes the controlled readable stream. Consumers will still be able to read any previously-enqueued chunks from
   * the stream, but once those are read, the stream will become closed.
   */
  close(): void {
    if (!IsReadableStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('close');
    }

    if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
      throw new TypeError('The stream is not in a state that permits close');
    }

    ReadableStreamDefaultControllerClose(this);
  }

  /**
   * Enqueues the given chunk `chunk` in the controlled readable stream.
   */
  enqueue(chunk: R): void;
  enqueue(chunk: R = undefined!): void {
    if (!IsReadableStreamDefaultController(this)) {
      throw defaultControllerBrandCheckException('enqueue');
    }

    if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
      throw new TypeError('The stream is not in a state that permits enqueue');
    }

    return ReadableStreamDefaultControllerEnqueue(this, chunk);
  }

  /**
   * Errors the controlled readable stream, making all future interactions with it fail with the given error `e`.
   */
  error(e: any = undefined): void {
    if (!IsReadableStreamDefaultController(this)) {
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
  [PullSteps](readRequest: ReadRequest<R>): void {
    const stream = this._controlledReadableStream;

    if (this._queue.length > 0) {
      const chunk = DequeueValue(this);

      if (this._closeRequested && this._queue.length === 0) {
        ReadableStreamDefaultControllerClearAlgorithms(this);
        ReadableStreamClose(stream);
      } else {
        ReadableStreamDefaultControllerCallPullIfNeeded(this);
      }

      readRequest._chunkSteps(chunk);
    } else {
      ReadableStreamAddReadRequest(stream, readRequest);
      ReadableStreamDefaultControllerCallPullIfNeeded(this);
    }
  }
}

Object.defineProperties(ReadableStreamDefaultController.prototype, {
  close: { enumerable: true },
  enqueue: { enumerable: true },
  error: { enumerable: true },
  desiredSize: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableStreamDefaultController.prototype, Symbol.toStringTag, {
    value: 'ReadableStreamDefaultController',
    configurable: true
  });
}

// Abstract operations for the ReadableStreamDefaultController.

function IsReadableStreamDefaultController<R = any>(x: any): x is ReadableStreamDefaultController<R> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableStream')) {
    return false;
  }

  return x instanceof ReadableStreamDefaultController;
}

function ReadableStreamDefaultControllerCallPullIfNeeded(controller: ReadableStreamDefaultController<any>): void {
  const shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
  if (!shouldPull) {
    return;
  }

  if (controller._pulling) {
    controller._pullAgain = true;
    return;
  }

  assert(!controller._pullAgain);

  controller._pulling = true;

  const pullPromise = controller._pullAlgorithm();
  uponPromise(
    pullPromise,
    () => {
      controller._pulling = false;

      if (controller._pullAgain) {
        controller._pullAgain = false;
        ReadableStreamDefaultControllerCallPullIfNeeded(controller);
      }
    },
    e => {
      ReadableStreamDefaultControllerError(controller, e);
    }
  );
}

function ReadableStreamDefaultControllerShouldCallPull(controller: ReadableStreamDefaultController<any>): boolean {
  const stream = controller._controlledReadableStream;

  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
    return false;
  }

  if (!controller._started) {
    return false;
  }

  if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
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

export function ReadableStreamDefaultControllerClose(controller: ReadableStreamDefaultController<any>) {
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
    return;
  }

  const stream = controller._controlledReadableStream;

  controller._closeRequested = true;

  if (controller._queue.length === 0) {
    ReadableStreamDefaultControllerClearAlgorithms(controller);
    ReadableStreamClose(stream);
  }
}

export function ReadableStreamDefaultControllerEnqueue<R>(
  controller: ReadableStreamDefaultController<R>,
  chunk: R
): void {
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
    return;
  }

  const stream = controller._controlledReadableStream;

  if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
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

export function ReadableStreamDefaultControllerError(controller: ReadableStreamDefaultController<any>, e: any) {
  const stream = controller._controlledReadableStream;

  if (stream._state !== 'readable') {
    return;
  }

  ResetQueue(controller);

  ReadableStreamDefaultControllerClearAlgorithms(controller);
  ReadableStreamError(stream, e);
}

export function ReadableStreamDefaultControllerGetDesiredSize(
  controller: ReadableStreamDefaultController<any>
): number | null {
  const state = controller._controlledReadableStream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

// This is used in the implementation of TransformStream.
export function ReadableStreamDefaultControllerHasBackpressure(
  controller: ReadableStreamDefaultController<any>
): boolean {
  if (ReadableStreamDefaultControllerShouldCallPull(controller)) {
    return false;
  }

  return true;
}

export function ReadableStreamDefaultControllerCanCloseOrEnqueue(
  controller: ReadableStreamDefaultController<any>
): boolean {
  const state = controller._controlledReadableStream._state;

  if (!controller._closeRequested && state === 'readable') {
    return true;
  }

  return false;
}

export function SetUpReadableStreamDefaultController<R>(stream: ReadableStream<R>,
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
  uponPromise(
    promiseResolvedWith(startResult),
    () => {
      controller._started = true;

      assert(!controller._pulling);
      assert(!controller._pullAgain);

      ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    },
    r => {
      ReadableStreamDefaultControllerError(controller, r);
    }
  );
}

export function SetUpReadableStreamDefaultControllerFromUnderlyingSource<R>(
  stream: ReadableStream<R>,
  underlyingSource: ValidatedUnderlyingSource<R>,
  highWaterMark: number,
  sizeAlgorithm: QueuingStrategySizeCallback<R>
) {
  const controller: ReadableStreamDefaultController<R> = Object.create(ReadableStreamDefaultController.prototype);

  let startAlgorithm: () => void | PromiseLike<void> = () => undefined;
  let pullAlgorithm: () => Promise<void> = () => promiseResolvedWith(undefined);
  let cancelAlgorithm: (reason: any) => Promise<void> = () => promiseResolvedWith(undefined);

  if (underlyingSource.start !== undefined) {
    startAlgorithm = () => underlyingSource.start!(controller);
  }
  if (underlyingSource.pull !== undefined) {
    pullAlgorithm = () => underlyingSource.pull!(controller);
  }
  if (underlyingSource.cancel !== undefined) {
    cancelAlgorithm = reason => underlyingSource.cancel!(reason);
  }

  SetUpReadableStreamDefaultController(
    stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm
  );
}

// Helper functions for the ReadableStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamDefaultController.prototype.${name} can only be used on a ReadableStreamDefaultController`);
}
