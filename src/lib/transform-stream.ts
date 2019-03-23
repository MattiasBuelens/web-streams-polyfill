import assert from '../stub/assert';
import {
  CreateAlgorithmFromUnderlyingMethod,
  InvokeOrNoop,
  IsNonNegativeNumber,
  MakeSizeAlgorithmFromSizeFunction,
  PromiseCall,
  typeIsObject,
  ValidateAndNormalizeHighWaterMark
} from './helpers';
import {
  ReadableStream,
  ReadableStreamDefaultControllerType as ReadableStreamDefaultController,
  ReadableStreamState
} from './readable-stream';
import { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import {
  WritableStream,
  WritableStreamDefaultControllerType as WritableStreamDefaultController,
  WritableStreamState
} from './writable-stream';

export type TransformStreamDefaultControllerCallback<O> = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
export type TransformStreamDefaultControllerTransformCallback<I, O> = (chunk: I,
  controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;

export interface Transformer<I = any, O = any> {
  start?: TransformStreamDefaultControllerCallback<O>;
  transform?: TransformStreamDefaultControllerTransformCallback<I, O>;
  flush?: TransformStreamDefaultControllerCallback<O>;
  readableType?: undefined;
  writableType?: undefined;
}

// Class TransformStream

class TransformStream<I = any, O = any> {
  /** @internal */
  _writable!: WritableStream<I>;
  /** @internal */
  _writableController!: WritableStreamDefaultController;
  /** @internal */
  _writableState!: WritableStreamState;
  /** @internal */
  _writableStoredError!: any;
  /** @internal */
  _readable!: ReadableStream<O>;
  /** @internal */
  _readableController!: ReadableStreamDefaultController<O>;
  /** @internal */
  _readableState!: ReadableStreamState;
  /** @internal */
  _readableStoredError!: any;
  /** @internal */
  _readableCloseRequested!: boolean;
  /** @internal */
  _backpressure!: boolean;
  /** @internal */
  _backpressureChangePromise!: Promise<void>;
  /** @internal */
  _backpressureChangePromise_resolve!: () => void;
  /** @internal */
  _transformStreamController!: TransformStreamDefaultController<O>;

  constructor(transformer: Transformer<I, O> = {},
              writableStrategy: QueuingStrategy<I> = {},
              readableStrategy: QueuingStrategy<O> = {}) {
    const writableSizeFunction = writableStrategy.size;
    let writableHighWaterMark = writableStrategy.highWaterMark;
    const readableSizeFunction = readableStrategy.size;
    let readableHighWaterMark = readableStrategy.highWaterMark;

    const writableType = transformer.writableType;

    if (writableType !== undefined) {
      throw new RangeError('Invalid writable type specified');
    }

    const writableSizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(writableSizeFunction);
    if (writableHighWaterMark === undefined) {
      writableHighWaterMark = 1;
    }
    writableHighWaterMark = ValidateAndNormalizeHighWaterMark(writableHighWaterMark);

    const readableType = transformer.readableType;

    if (readableType !== undefined) {
      throw new RangeError('Invalid readable type specified');
    }

    const readableSizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(readableSizeFunction);
    if (readableHighWaterMark === undefined) {
      readableHighWaterMark = 0;
    }
    readableHighWaterMark = ValidateAndNormalizeHighWaterMark(readableHighWaterMark);

    let startPromise_resolve!: (value: void | PromiseLike<void>) => void;
    const startPromise = new Promise<void>(resolve => {
      startPromise_resolve = resolve;
    });

    InitializeTransformStream(this, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark,
                              readableSizeAlgorithm);
    SetUpTransformStreamDefaultControllerFromTransformer(this, transformer);

    const startResult = InvokeOrNoop<typeof transformer, 'start'>(
      transformer, 'start', [this._transformStreamController]
    );
    startPromise_resolve(startResult);
  }

  get readable(): ReadableStream<O> {
    if (IsTransformStream(this) === false) {
      throw streamBrandCheckException('readable');
    }

    return this._readable;
  }

  get writable(): WritableStream<I> {
    if (IsTransformStream(this) === false) {
      throw streamBrandCheckException('writable');
    }

    return this._writable;
  }
}

// Transform Stream Abstract Operations

function CreateTransformStream<I, O>(startAlgorithm: () => void | PromiseLike<void>,
                                     transformAlgorithm: (chunk: I) => Promise<void>,
                                     flushAlgorithm: () => Promise<void>,
                                     writableHighWaterMark: number = 1,
                                     writableSizeAlgorithm: QueuingStrategySizeCallback<I> = () => 1,
                                     readableHighWaterMark: number = 0,
                                     readableSizeAlgorithm: QueuingStrategySizeCallback<O> = () => 1) {
  assert(IsNonNegativeNumber(writableHighWaterMark));
  assert(IsNonNegativeNumber(readableHighWaterMark));

  const stream: TransformStream<I, O> = Object.create(TransformStream.prototype);

  let startPromise_resolve!: (value: void | PromiseLike<void>) => void;
  const startPromise = new Promise<void>(resolve => {
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
  stream._writable = CreateWritableStream(stream,
                                          startAlgorithm,
                                          writeAlgorithm,
                                          closeAlgorithm,
                                          abortAlgorithm,
                                          writableHighWaterMark,
                                          writableSizeAlgorithm);

  function pullAlgorithm(): Promise<void> {
    return TransformStreamDefaultSourcePullAlgorithm(stream);
  }

  function cancelAlgorithm(reason: any): Promise<void> {
    TransformStreamErrorWritableAndUnblockWrite(stream, reason);
    return Promise.resolve();
  }

  stream._readableState = 'readable';
  stream._readableStoredError = undefined;
  stream._readableCloseRequested = false;
  stream._readable = CreateReadableStream(stream,
                                          startAlgorithm,
                                          pullAlgorithm,
                                          cancelAlgorithm,
                                          readableHighWaterMark,
                                          readableSizeAlgorithm);

  // The [[backpressure]] slot is set to undefined so that it can be initialised by TransformStreamSetBackpressure.
  stream._backpressure = undefined!;
  stream._backpressureChangePromise = undefined!;
  stream._backpressureChangePromise_resolve = undefined!;
  TransformStreamSetBackpressure(stream, true);

  // Used by IsWritableStream() which is called by SetUpTransformStreamDefaultController().
  stream._transformStreamController = undefined!;
}

function IsTransformStream<I, O>(x: any): x is TransformStream<I, O> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_transformStreamController')) {
    return false;
  }

  return true;
}

// This is a no-op if both sides are already errored.
function TransformStreamError(stream: TransformStream, e: any) {
  ReadableStreamDefaultControllerError(stream, e);
  TransformStreamErrorWritableAndUnblockWrite(stream, e);
}

function TransformStreamErrorWritableAndUnblockWrite(stream: TransformStream, e: any) {
  TransformStreamDefaultControllerClearAlgorithms(stream._transformStreamController);
  WritableStreamDefaultControllerErrorIfNeeded(stream, e);
  if (stream._backpressure === true) {
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

  stream._backpressureChangePromise = new Promise(resolve => {
    stream._backpressureChangePromise_resolve = resolve;
  });

  stream._backpressure = backpressure;
}

// Class TransformStreamDefaultController

export type TransformStreamDefaultControllerType<O> = TransformStreamDefaultController<O>;

class TransformStreamDefaultController<O> {
  /** @internal */
  _controlledTransformStream: TransformStream<any, O>;
  /** @internal */
  _transformAlgorithm: (chunk: any) => Promise<void>;
  /** @internal */
  _flushAlgorithm: () => Promise<void>;

  /** @internal */
  constructor() {
    throw new TypeError('TransformStreamDefaultController instances cannot be created directly');
  }

  get desiredSize(): number | null {
    if (IsTransformStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('desiredSize');
    }

    const stream = this._controlledTransformStream;
    return ReadableStreamDefaultControllerGetDesiredSize(stream);
  }

  enqueue(chunk: O): void {
    if (IsTransformStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('enqueue');
    }

    TransformStreamDefaultControllerEnqueue(this, chunk);
  }

  error(reason: any): void {
    if (IsTransformStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('error');
    }

    TransformStreamDefaultControllerError(this, reason);
  }

  terminate(): void {
    if (IsTransformStreamDefaultController(this) === false) {
      throw defaultControllerBrandCheckException('terminate');
    }

    TransformStreamDefaultControllerTerminate(this);
  }
}

// Transform Stream Default Controller Abstract Operations

function IsTransformStreamDefaultController<O>(x: any): x is TransformStreamDefaultController<O> {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledTransformStream')) {
    return false;
  }

  return true;
}

function SetUpTransformStreamDefaultController<I, O>(stream: TransformStream<I, O>,
                                                     controller: TransformStreamDefaultController<O>,
                                                     transformAlgorithm: (chunk: I) => Promise<void>,
                                                     flushAlgorithm: () => Promise<void>) {
  assert(IsTransformStream(stream) === true);
  assert(stream._transformStreamController === undefined);

  controller._controlledTransformStream = stream;
  stream._transformStreamController = controller;

  controller._transformAlgorithm = transformAlgorithm;
  controller._flushAlgorithm = flushAlgorithm;
}

function SetUpTransformStreamDefaultControllerFromTransformer<I, O>(stream: TransformStream<I, O>,
                                                                    transformer: Transformer<I, O>) {
  assert(transformer !== undefined);

  const controller: TransformStreamDefaultController<O> = Object.create(TransformStreamDefaultController.prototype);

  let transformAlgorithm = (chunk: I) => {
    try {
      TransformStreamDefaultControllerEnqueue(controller, chunk as unknown as O);
      return Promise.resolve();
    } catch (transformResultE) {
      return Promise.reject(transformResultE);
    }
  };
  const transformMethod = transformer.transform;
  if (transformMethod !== undefined) {
    if (typeof transformMethod !== 'function') {
      throw new TypeError('transform is not a method');
    }
    transformAlgorithm = chunk => PromiseCall(transformMethod, transformer, [chunk, controller]);
  }

  const flushAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof transformer, 'flush'>(
    transformer, 'flush', 0, [controller]
  );

  SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm);
}

function TransformStreamDefaultControllerClearAlgorithms(controller: TransformStreamDefaultController<any>) {
  controller._transformAlgorithm = undefined!;
  controller._flushAlgorithm = undefined!;
}

function TransformStreamDefaultControllerEnqueue<O>(controller: TransformStreamDefaultController<O>, chunk: O) {
  const stream = controller._controlledTransformStream;
  if (ReadableStreamDefaultControllerCanCloseOrEnqueue(stream) === false) {
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
    assert(backpressure === true);
    TransformStreamSetBackpressure(stream, true);
  }
}

function TransformStreamDefaultControllerError(controller: TransformStreamDefaultController<any>, e: any) {
  TransformStreamError(controller._controlledTransformStream, e);
}

function TransformStreamDefaultControllerPerformTransform<I, O>(controller: TransformStreamDefaultController<O>,
                                                                chunk: I) {
  const transformPromise = controller._transformAlgorithm(chunk);
  return transformPromise.catch(r => {
    TransformStreamError(controller._controlledTransformStream, r);
    throw r;
  });
}

function TransformStreamDefaultControllerTerminate<O>(controller: TransformStreamDefaultController<O>) {
  const stream = controller._controlledTransformStream;

  if (ReadableStreamDefaultControllerCanCloseOrEnqueue(stream) === true) {
    ReadableStreamDefaultControllerClose(stream);
  }

  const error = new TypeError('TransformStream terminated');
  TransformStreamErrorWritableAndUnblockWrite(stream, error);
}

// TransformStreamDefaultSink Algorithms

function TransformStreamDefaultSinkWriteAlgorithm<I, O>(stream: TransformStream<I, O>, chunk: I): Promise<void> {
  assert(stream._writableState === 'writable');

  const controller = stream._transformStreamController;

  if (stream._backpressure === true) {
    const backpressureChangePromise = stream._backpressureChangePromise;
    assert(backpressureChangePromise !== undefined);
    return backpressureChangePromise.then(() => {
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
  return Promise.resolve();
}

function TransformStreamDefaultSinkCloseAlgorithm<I, O>(stream: TransformStream<I, O>): Promise<void> {
  // stream._readable cannot change after construction, so caching it across a call to user code is safe.
  // const readable = stream._readable;

  const controller = stream._transformStreamController;
  const flushPromise = controller._flushAlgorithm();
  TransformStreamDefaultControllerClearAlgorithms(controller);

  // Return a promise that is fulfilled with undefined on success.
  return flushPromise.then(() => {
    if (stream._readableState === 'errored') {
      throw stream._readableStoredError;
    }
    if (ReadableStreamDefaultControllerCanCloseOrEnqueue(stream) === true) {
      ReadableStreamDefaultControllerClose(stream);
    }
  }).catch(r => {
    TransformStreamError(stream, r);
    throw stream._readableStoredError;
  });
}

// TransformStreamDefaultSource Algorithms

function TransformStreamDefaultSourcePullAlgorithm(stream: TransformStream): Promise<void> {
  // Invariant. Enforced by the promises returned by start() and pull().
  assert(stream._backpressure === true);

  assert(stream._backpressureChangePromise !== undefined);

  TransformStreamSetBackpressure(stream, false);

  // Prevent the next pull() call until there is backpressure.
  return stream._backpressureChangePromise;
}

export { CreateTransformStream, TransformStream };

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
                                 highWaterMark: number = 1,
                                 sizeAlgorithm: QueuingStrategySizeCallback<R> = () => 1): ReadableStream<R> {
  return new ReadableStream<R>({
    start(controller) {
      stream._readableController = controller;
      return startAlgorithm().catch(e => {
        ReadableStreamDefaultControllerError(stream, e);
      });
    },
    pull() {
      return pullAlgorithm().catch(e => {
        ReadableStreamDefaultControllerError(stream, e);
      });
    },
    cancel(reason) {
      assert(stream._readableState === 'readable');
      stream._readableState = 'closed';

      return cancelAlgorithm(reason);
    }
  }, { highWaterMark, size: sizeAlgorithm });
}

function ReadableStreamDefaultControllerCanCloseOrEnqueue(stream: TransformStream<any, any>): boolean {
  const state = stream._readableState;

  if (stream._readableCloseRequested === false && state === 'readable') {
    return true;
  }

  return false;
}

function ReadableStreamDefaultControllerClose(stream: TransformStream<any, any>): void {
  assert(stream._readableState === 'readable');
  assert(stream._readableCloseRequested === false);
  stream._readableCloseRequested = true;

  stream._readableController.close();
}

function ReadableStreamDefaultControllerEnqueue<R>(stream: TransformStream<any, any>, chunk: R): void {
  stream._readableController.enqueue(chunk);
}

function ReadableStreamDefaultControllerError(stream: TransformStream<any, any>, e: any) {
  if (stream._readableState === 'readable') {
    stream._readableState = 'errored';
  }

  stream._readableController.error(e);
}

function ReadableStreamDefaultControllerGetDesiredSize(stream: TransformStream<any, any>): number | null {
  return stream._readableController.desiredSize;
}

function ReadableStreamDefaultControllerHasBackpressure(stream: TransformStream<any, any>): boolean {
  return ReadableStreamDefaultControllerGetDesiredSize(stream)! <= 0;
}

function WritableStreamDefaultControllerErrorIfNeeded(stream: TransformStream<any, any>, error: any) {
  stream._writableController.error(error);
}

function CreateWritableStream<W>(stream: TransformStream<W, any>,
                                 startAlgorithm: () => Promise<void>,
                                 writeAlgorithm: (chunk: W) => Promise<void>,
                                 closeAlgorithm: () => Promise<void>,
                                 abortAlgorithm: (reason: any) => Promise<void>,
                                 highWaterMark: number = 1,
                                 sizeAlgorithm: QueuingStrategySizeCallback<W> = () => 1): WritableStream<W> {
  return new WritableStream({
    start(controller) {
      stream._writableController = controller;
      // TODO Handle errors
      return startAlgorithm();
    },
    write(chunk) {
      // TODO Handle errors
      return writeAlgorithm(chunk);
    },
    close() {
      return closeAlgorithm().then(() => {
        WritableStreamFinishInFlightClose(stream);
      }, e => {
        WritableStreamFinishInFlightCloseWithError(stream, e);
      });
    },
    abort(reason) {
      // TODO Handle errors
      return abortAlgorithm(reason);
    }
  }, { highWaterMark, size: sizeAlgorithm });
}

function WritableStreamDealWithRejection(stream: TransformStream<any, any>, error: any) {
  const state = stream._writableState;

  if (state === 'writable') {
    WritableStreamStartErroring(stream, error);
    return;
  }

  assert(state === 'erroring');
  WritableStreamFinishErroring(stream);
}

function WritableStreamStartErroring(stream: TransformStream<any, any>, reason: any) {
  assert(stream._writableStoredError === undefined);
  assert(stream._writableState === 'writable');

  stream._writableState = 'erroring';
  stream._writableStoredError = reason;

  // TODO
  // if (WritableStreamHasOperationMarkedInFlight(stream) === false && controller._started === true) {
  //   WritableStreamFinishErroring(stream);
  // }
}

function WritableStreamFinishErroring(stream: TransformStream<any, any>) {
  assert(stream._writableState === 'erroring');
  stream._writableStoredError = 'errored';
}

function WritableStreamFinishInFlightClose(stream: TransformStream<any, any>) {
  const state = stream._writableState;

  assert(state === 'writable' || state === 'erroring');

  if (state === 'erroring') {
    // The error was too late to do anything, so it is ignored.
    stream._writableStoredError = undefined;
  }

  stream._writableState = 'closed';

  assert(stream._writableStoredError === undefined);
}

function WritableStreamFinishInFlightCloseWithError(stream: TransformStream<any, any>, error: any) {
  const state = stream._writableState;

  assert(state === 'writable' || state === 'erroring');

  WritableStreamDealWithRejection(stream, error);
}
