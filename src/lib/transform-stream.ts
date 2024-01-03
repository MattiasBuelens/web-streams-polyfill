import assert from '../stub/assert';
import {
  newPromise,
  promiseRejectedWith,
  promiseResolvedWith, setPromiseIsHandledToTrue,
  transformPromiseWith,
  uponPromise
} from './helpers/webidl';
import {
  CreateReadableStream,
  ReadableStream,
  type ReadableStreamDefaultController
} from './readable-stream';
import {
  ReadableStreamDefaultControllerCanCloseOrEnqueue,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError,
  ReadableStreamDefaultControllerGetDesiredSize,
  ReadableStreamDefaultControllerHasBackpressure
} from './readable-stream/default-controller';
import type { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import { CreateWritableStream, WritableStream, WritableStreamDefaultControllerErrorIfNeeded } from './writable-stream';
import { setFunctionName, typeIsObject } from './helpers/miscellaneous';
import { IsNonNegativeNumber } from './abstract-ops/miscellaneous';
import { convertQueuingStrategy } from './validators/queuing-strategy';
import { ExtractHighWaterMark, ExtractSizeAlgorithm } from './abstract-ops/queuing-strategy';
import type {
  Transformer,
  TransformerCancelCallback,
  TransformerFlushCallback,
  TransformerStartCallback,
  TransformerTransformCallback,
  ValidatedTransformer
} from './transform-stream/transformer';
import { convertTransformer } from './validators/transformer';

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
  /** @internal */
  _writable!: WritableStream<I>;
  /** @internal */
  _readable!: ReadableStream<O>;
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

    return this._readable;
  }

  /**
   * The writable side of the transform stream.
   */
  get writable(): WritableStream<I> {
    if (!IsTransformStream(this)) {
      throw streamBrandCheckException('writable');
    }

    return this._writable;
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

export type {
  Transformer,
  TransformerCancelCallback,
  TransformerStartCallback,
  TransformerFlushCallback,
  TransformerTransformCallback
};

// Transform Stream Abstract Operations

export function CreateTransformStream<I, O>(startAlgorithm: () => void | PromiseLike<void>,
                                            transformAlgorithm: (chunk: I) => Promise<void>,
                                            flushAlgorithm: () => Promise<void>,
                                            cancelAlgorithm: (reason: any) => Promise<void>,
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

  SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm);

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

  stream._writable = CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm,
                                          writableHighWaterMark, writableSizeAlgorithm);

  function pullAlgorithm(): Promise<void> {
    return TransformStreamDefaultSourcePullAlgorithm(stream);
  }

  function cancelAlgorithm(reason: any): Promise<void> {
    return TransformStreamDefaultSourceCancelAlgorithm(stream, reason);
  }

  stream._readable = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, readableHighWaterMark,
                                          readableSizeAlgorithm);

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
  ReadableStreamDefaultControllerError(
    stream._readable._readableStreamController as ReadableStreamDefaultController<any>,
    e
  );
  TransformStreamErrorWritableAndUnblockWrite(stream, e);
}

function TransformStreamErrorWritableAndUnblockWrite(stream: TransformStream, e: any) {
  TransformStreamDefaultControllerClearAlgorithms(stream._transformStreamController);
  WritableStreamDefaultControllerErrorIfNeeded(stream._writable._writableStreamController, e);
  TransformStreamUnblockWrite(stream);
}

function TransformStreamUnblockWrite(stream: TransformStream) {
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
  _finishPromise: Promise<undefined> | undefined;
  /** @internal */
  _finishPromise_resolve?: (value?: undefined) => void;
  /** @internal */
  _finishPromise_reject?: (reason: any) => void;
  /** @internal */
  _transformAlgorithm: (chunk: any) => Promise<void>;
  /** @internal */
  _flushAlgorithm: () => Promise<void>;
  /** @internal */
  _cancelAlgorithm: (reason: any) => Promise<void>;

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

    const readableController = this._controlledTransformStream._readable._readableStreamController;
    return ReadableStreamDefaultControllerGetDesiredSize(readableController as ReadableStreamDefaultController<O>);
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
setFunctionName(TransformStreamDefaultController.prototype.enqueue, 'enqueue');
setFunctionName(TransformStreamDefaultController.prototype.error, 'error');
setFunctionName(TransformStreamDefaultController.prototype.terminate, 'terminate');
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
                                                     flushAlgorithm: () => Promise<void>,
                                                     cancelAlgorithm: (reason: any) => Promise<void>) {
  assert(IsTransformStream(stream));
  assert(stream._transformStreamController === undefined);

  controller._controlledTransformStream = stream;
  stream._transformStreamController = controller;

  controller._transformAlgorithm = transformAlgorithm;
  controller._flushAlgorithm = flushAlgorithm;
  controller._cancelAlgorithm = cancelAlgorithm;

  controller._finishPromise = undefined;
  controller._finishPromise_resolve = undefined;
  controller._finishPromise_reject = undefined;
}

function SetUpTransformStreamDefaultControllerFromTransformer<I, O>(stream: TransformStream<I, O>,
                                                                    transformer: ValidatedTransformer<I, O>) {
  const controller: TransformStreamDefaultController<O> = Object.create(TransformStreamDefaultController.prototype);

  let transformAlgorithm: (chunk: I) => Promise<void>;
  let flushAlgorithm: () => Promise<void>;
  let cancelAlgorithm: (reason: any) => Promise<void>;

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

  if (transformer.cancel !== undefined) {
    cancelAlgorithm = reason => transformer.cancel!(reason);
  } else {
    cancelAlgorithm = () => promiseResolvedWith(undefined);
  }

  SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm);
}

function TransformStreamDefaultControllerClearAlgorithms(controller: TransformStreamDefaultController<any>) {
  controller._transformAlgorithm = undefined!;
  controller._flushAlgorithm = undefined!;
  controller._cancelAlgorithm = undefined!;
}

function TransformStreamDefaultControllerEnqueue<O>(controller: TransformStreamDefaultController<O>, chunk: O) {
  const stream = controller._controlledTransformStream;
  const readableController = stream._readable._readableStreamController as ReadableStreamDefaultController<O>;
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController)) {
    throw new TypeError('Readable side is not in a state that permits enqueue');
  }

  // We throttle transform invocations based on the backpressure of the ReadableStream, but we still
  // accept TransformStreamDefaultControllerEnqueue() calls.

  try {
    ReadableStreamDefaultControllerEnqueue(readableController, chunk);
  } catch (e) {
    // This happens when readableStrategy.size() throws.
    TransformStreamErrorWritableAndUnblockWrite(stream, e);

    throw stream._readable._storedError;
  }

  const backpressure = ReadableStreamDefaultControllerHasBackpressure(readableController);
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
  const readableController = stream._readable._readableStreamController as ReadableStreamDefaultController<O>;

  ReadableStreamDefaultControllerClose(readableController);

  const error = new TypeError('TransformStream terminated');
  TransformStreamErrorWritableAndUnblockWrite(stream, error);
}

// TransformStreamDefaultSink Algorithms

function TransformStreamDefaultSinkWriteAlgorithm<I, O>(stream: TransformStream<I, O>, chunk: I): Promise<void> {
  assert(stream._writable._state === 'writable');

  const controller = stream._transformStreamController;

  if (stream._backpressure) {
    const backpressureChangePromise = stream._backpressureChangePromise;
    assert(backpressureChangePromise !== undefined);
    return transformPromiseWith(backpressureChangePromise, () => {
      const writable = stream._writable;
      const state = writable._state;
      if (state === 'erroring') {
        throw writable._storedError;
      }
      assert(state === 'writable');
      return TransformStreamDefaultControllerPerformTransform<I, O>(controller, chunk);
    });
  }

  return TransformStreamDefaultControllerPerformTransform<I, O>(controller, chunk);
}

function TransformStreamDefaultSinkAbortAlgorithm<I, O>(stream: TransformStream<I, O>, reason: any): Promise<void> {
  const controller = stream._transformStreamController;
  if (controller._finishPromise !== undefined) {
    return controller._finishPromise;
  }

  // stream._readable cannot change after construction, so caching it across a call to user code is safe.
  const readable = stream._readable;

  // Assign the _finishPromise now so that if _cancelAlgorithm calls readable.cancel() internally,
  // we don't run the _cancelAlgorithm again.
  controller._finishPromise = newPromise((resolve, reject) => {
    controller._finishPromise_resolve = resolve;
    controller._finishPromise_reject = reject;
  });

  const cancelPromise = controller._cancelAlgorithm(reason);
  TransformStreamDefaultControllerClearAlgorithms(controller);

  uponPromise(cancelPromise, () => {
    if (readable._state === 'errored') {
      defaultControllerFinishPromiseReject(controller, readable._storedError);
    } else {
      ReadableStreamDefaultControllerError(
        readable._readableStreamController as ReadableStreamDefaultController<O>,
        reason
      );
      defaultControllerFinishPromiseResolve(controller);
    }
    return null;
  }, r => {
    ReadableStreamDefaultControllerError(
      readable._readableStreamController as ReadableStreamDefaultController<O>,
      r
    );
    defaultControllerFinishPromiseReject(controller, r);
    return null;
  });

  return controller._finishPromise;
}

function TransformStreamDefaultSinkCloseAlgorithm<I, O>(stream: TransformStream<I, O>): Promise<void> {
  const controller = stream._transformStreamController;
  if (controller._finishPromise !== undefined) {
    return controller._finishPromise;
  }

  // stream._readable cannot change after construction, so caching it across a call to user code is safe.
  const readable = stream._readable;

  // Assign the _finishPromise now so that if _flushAlgorithm calls readable.cancel() internally,
  // we don't also run the _cancelAlgorithm.
  controller._finishPromise = newPromise((resolve, reject) => {
    controller._finishPromise_resolve = resolve;
    controller._finishPromise_reject = reject;
  });

  const flushPromise = controller._flushAlgorithm();
  TransformStreamDefaultControllerClearAlgorithms(controller);

  uponPromise(flushPromise, () => {
    if (readable._state === 'errored') {
      defaultControllerFinishPromiseReject(controller, readable._storedError);
    } else {
      ReadableStreamDefaultControllerClose(readable._readableStreamController as ReadableStreamDefaultController<O>);
      defaultControllerFinishPromiseResolve(controller);
    }
    return null;
  }, r => {
    ReadableStreamDefaultControllerError(readable._readableStreamController as ReadableStreamDefaultController<O>, r);
    defaultControllerFinishPromiseReject(controller, r);
    return null;
  });

  return controller._finishPromise;
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

function TransformStreamDefaultSourceCancelAlgorithm<I, O>(stream: TransformStream<I, O>, reason: any): Promise<void> {
  const controller = stream._transformStreamController;
  if (controller._finishPromise !== undefined) {
    return controller._finishPromise;
  }

  // stream._writable cannot change after construction, so caching it across a call to user code is safe.
  const writable = stream._writable;

  // Assign the _finishPromise now so that if _flushAlgorithm calls writable.abort() or
  // writable.cancel() internally, we don't run the _cancelAlgorithm again, or also run the
  // _flushAlgorithm.
  controller._finishPromise = newPromise((resolve, reject) => {
    controller._finishPromise_resolve = resolve;
    controller._finishPromise_reject = reject;
  });

  const cancelPromise = controller._cancelAlgorithm(reason);
  TransformStreamDefaultControllerClearAlgorithms(controller);

  uponPromise(cancelPromise, () => {
    if (writable._state === 'errored') {
      defaultControllerFinishPromiseReject(controller, writable._storedError);
    } else {
      WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, reason);
      TransformStreamUnblockWrite(stream);
      defaultControllerFinishPromiseResolve(controller);
    }
    return null;
  }, r => {
    WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, r);
    TransformStreamUnblockWrite(stream);
    defaultControllerFinishPromiseReject(controller, r);
    return null;
  });

  return controller._finishPromise;
}

// Helper functions for the TransformStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `TransformStreamDefaultController.prototype.${name} can only be used on a TransformStreamDefaultController`);
}

export function defaultControllerFinishPromiseResolve(controller: TransformStreamDefaultController<any>) {
  if (controller._finishPromise_resolve === undefined) {
    return;
  }

  controller._finishPromise_resolve();
  controller._finishPromise_resolve = undefined;
  controller._finishPromise_reject = undefined;
}

export function defaultControllerFinishPromiseReject(controller: TransformStreamDefaultController<any>, reason: any) {
  if (controller._finishPromise_reject === undefined) {
    return;
  }

  setPromiseIsHandledToTrue(controller._finishPromise!);
  controller._finishPromise_reject(reason);
  controller._finishPromise_resolve = undefined;
  controller._finishPromise_reject = undefined;
}

// Helper functions for the TransformStream.

function streamBrandCheckException(name: string): TypeError {
  return new TypeError(
    `TransformStream.prototype.${name} can only be used on a TransformStream`);
}
