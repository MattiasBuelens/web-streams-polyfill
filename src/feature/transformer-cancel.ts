import type { TransformStream as OwnTransformStream, TransformStreamDefaultController } from '../lib/transform-stream';
import type { TransformStreamSides } from '../lib/transform-stream/sides';
import {
  InitializeTransformStreamState,
  SetUpTransformStreamDefaultControllerFromTransformer,
  TransformStreamDefaultControllerEnqueue,
  TransformStreamDefaultControllerError,
  TransformStreamDefaultControllerTerminate,
  TransformStreamDefaultSinkAbortAlgorithm,
  TransformStreamDefaultSinkCloseAlgorithm,
  TransformStreamDefaultSinkWriteAlgorithm,
  TransformStreamDefaultSourceCancelAlgorithm,
  TransformStreamDefaultSourcePullAlgorithm
} from '../lib/transform-stream/core';
import type { Transformer } from '../lib/transform-stream/transformer';
import { readTransformer, wrapTransformer } from '../lib/validators/transformer';
import { convertQueuingStrategy } from '../lib/validators/queuing-strategy';
import { ExtractHighWaterMark, ExtractSizeAlgorithm } from '../lib/abstract-ops/queuing-strategy';
import { setFunctionName, typeIsObject } from '../lib/helpers/miscellaneous';
import { newPromise, promiseResolvedWith, reflectCall, setPromiseIsHandledToTrue, uponPromise } from '../lib/helpers/webidl';
import { patchGetter, patchMethod } from './patch';
import { getGlobals, type StreamClasses } from './types';

/**
 * Adds support for `transformer.cancel()`, which is called when the readable side is cancelled
 * or the writable side is aborted.
 *
 * @public
 */
export const name = 'transformer-cancel';

/**
 * Checks whether `new TransformStream({ cancel })` calls `cancel()` when its readable side is cancelled.
 *
 * @public
 */
export function check(classes: StreamClasses = getGlobals()): boolean {
  const TransformStream = classes.TransformStream;
  if (typeof TransformStream !== 'function') {
    return false;
  }
  let called = false;
  try {
    const stream = new TransformStream({
      cancel() {
        called = true;
      }
    });
    // ReadableStreamCancel() calls the cancel algorithm synchronously.
    setPromiseIsHandledToTrue(stream.readable.cancel());
  } catch {
    return false;
  }
  return called;
}

/**
 * Installs support for `transformer.cancel()` if {@link check} fails.
 * Returns `true` if it was installed.
 *
 * `TransformStream` is replaced by a constructor that shares the native prototype.
 * A transformer without `cancel()` still gets a native `TransformStream`.
 * A transformer with `cancel()` gets a `TransformStream` whose readable and writable sides are still native streams,
 * but which runs this library's transform stream algorithms on top of them.
 * The native prototype's getters and the native controller's methods are patched to handle both kinds.
 *
 * @public
 */
export function install(classes: StreamClasses = getGlobals()): boolean {
  if (check(classes)) {
    return false;
  }
  const NativeTransformStream = classes.TransformStream;
  const NativeReadableStream = classes.ReadableStream;
  const NativeWritableStream = classes.WritableStream;
  if (typeof NativeTransformStream !== 'function'
    || typeof NativeReadableStream !== 'function'
    || typeof NativeWritableStream !== 'function'
    || !hasWritableSignal(NativeWritableStream)) {
    return false;
  }

  const env: NativeEnvironment = { NativeReadableStream, NativeWritableStream };
  const streamPrototype = NativeTransformStream.prototype;
  const controllerPrototype = typeof classes.TransformStreamDefaultController === 'function'
    ? classes.TransformStreamDefaultController.prototype
    : getControllerPrototype(NativeTransformStream);

  const { TransformStream } = {
    TransformStream: function (this: any, ...args: any[]): any {
      if (new.target === undefined) {
        throw new TypeError('Constructor TransformStream requires \'new\'');
      }
      let rawTransformer = args[0] as Transformer | null | undefined;
      if (rawTransformer === undefined) {
        rawTransformer = null;
      }
      const members = readTransformer(rawTransformer, 'First parameter');
      if (members.cancel === undefined) {
        // Hand off to the native constructor, without reading the transformer's members again.
        const nativeArgs = args.slice();
        nativeArgs[0] = toNativeTransformer(rawTransformer, members);
        return Reflect.construct(NativeTransformStream, nativeArgs, new.target);
      }
      const transformer = wrapTransformer(members, rawTransformer);
      const stream: NativeBackedTransformStream = Object.create(new.target.prototype);
      SetUpNativeBackedTransformStream(env, stream, controllerPrototype, transformer, args[1], args[2]);
      return stream;
    }
  };
  setFunctionName(TransformStream, 'TransformStream');
  Object.defineProperty(TransformStream, 'prototype', { value: streamPrototype, writable: false });
  Object.defineProperty(streamPrototype, 'constructor', {
    ...Object.getOwnPropertyDescriptor(streamPrototype, 'constructor'),
    value: TransformStream
  });

  patchGetter(streamPrototype, 'readable', {
    get readable() {
      return IsNativeBackedTransformStream(this) ? this._readable : undefined;
    }
  }, IsNativeBackedTransformStream);
  patchGetter(streamPrototype, 'writable', {
    get writable() {
      return IsNativeBackedTransformStream(this) ? this._writable : undefined;
    }
  }, IsNativeBackedTransformStream);

  patchGetter(controllerPrototype, 'desiredSize', {
    get desiredSize() {
      const stream = (this as TransformStreamDefaultController<any>)._controlledTransformStream;
      return stream._sides.readableGetDesiredSize(stream);
    }
  }, IsNativeBackedController);
  patchMethod(controllerPrototype, 'enqueue', {
    enqueue(this: TransformStreamDefaultController<any>, chunk: any = undefined) {
      TransformStreamDefaultControllerEnqueue(this, chunk);
    }
  }, IsNativeBackedController);
  patchMethod(controllerPrototype, 'error', {
    error(this: TransformStreamDefaultController<any>, reason: any = undefined) {
      TransformStreamDefaultControllerError(this, reason);
    }
  }, IsNativeBackedController);
  patchMethod(controllerPrototype, 'terminate', {
    terminate(this: TransformStreamDefaultController<any>) {
      TransformStreamDefaultControllerTerminate(this);
    }
  }, IsNativeBackedController);

  const existing = Object.getOwnPropertyDescriptor(classes, 'TransformStream');
  Object.defineProperty(classes, 'TransformStream', {
    value: TransformStream,
    writable: existing?.writable ?? true,
    enumerable: existing?.enumerable ?? false,
    configurable: existing?.configurable ?? true
  });
  return true;
}

interface NativeEnvironment {
  NativeReadableStream: any;
  NativeWritableStream: any;
}

/**
 * The state of the native readable and writable sides, as far as we can't read it from their public API.
 * This "shadow state" follows the [[state]] slots of the native streams.
 */
interface NativeSidesState {
  readableController: ReadableStreamDefaultController;
  readableStoredError: any;
  readableCloseRequested: boolean;
  readableCancelled: boolean;
  readablePullCalled: boolean;
  readablePulling: boolean;

  writableController: WritableStreamDefaultController;
  writableState: 'writable' | 'erroring' | 'errored' | 'closed';
  writableStoredError: any;
  writableStarted: boolean;
  writableInFlight: boolean;
}

type NativeBackedTransformStream = OwnTransformStream & { _native: NativeSidesState };

function IsNativeBackedTransformStream(x: any): x is NativeBackedTransformStream {
  return typeIsObject(x) && Object.prototype.hasOwnProperty.call(x, '_native');
}

function IsNativeBackedController(x: any): x is TransformStreamDefaultController<any> {
  return typeIsObject(x) && Object.prototype.hasOwnProperty.call(x, '_controlledTransformStream');
}

function SetUpNativeBackedTransformStream(
  env: NativeEnvironment,
  stream: NativeBackedTransformStream,
  controllerPrototype: object,
  transformer: ReturnType<typeof wrapTransformer>,
  rawWritableStrategy: QueuingStrategy | null | undefined,
  rawReadableStrategy: QueuingStrategy | null | undefined
) {
  const writableStrategy = convertQueuingStrategy(rawWritableStrategy ?? {}, 'Second parameter');
  const readableStrategy = convertQueuingStrategy(rawReadableStrategy ?? {}, 'Third parameter');
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
  const startPromise = newPromise<void>((resolve) => {
    startPromise_resolve = resolve;
  });

  InitializeNativeSides(
    env, stream, startPromise,
    writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm
  );
  InitializeTransformStreamState(stream, nativeSides);

  const controller: TransformStreamDefaultController<any> = Object.create(controllerPrototype);
  SetUpTransformStreamDefaultControllerFromTransformer(stream, controller, transformer);

  if (transformer.start !== undefined) {
    startPromise_resolve(transformer.start(controller));
  } else {
    startPromise_resolve(undefined);
  }
}

function InitializeNativeSides(
  env: NativeEnvironment,
  stream: NativeBackedTransformStream,
  startPromise: Promise<void>,
  writableHighWaterMark: number,
  writableSizeAlgorithm: (chunk: any) => number,
  readableHighWaterMark: number,
  readableSizeAlgorithm: (chunk: any) => number
) {
  const state: NativeSidesState = {
    readableController: undefined!,
    readableStoredError: undefined,
    readableCloseRequested: false,
    readableCancelled: false,
    readablePullCalled: false,
    readablePulling: false,
    writableController: undefined!,
    writableState: 'writable',
    writableStoredError: undefined,
    writableStarted: false,
    writableInFlight: false
  };
  stream._native = state;

  // The streams standard reacts to the results of the underlying sink's and source's algorithms
  // through "a promise resolved with" that result, which takes two extra ticks for a promise.
  // Native implementations don't all agree on that timing, so the shadow state follows the standard instead:
  // that way, the TransformStream algorithms see the same states at the same time as in the standard.
  uponPromise(promiseResolvedWith(startPromise), () => {
    state.writableStarted = true;
    if (state.writableState === 'erroring') {
      state.writableState = 'errored';
    }
    return null;
  }, (r) => {
    state.writableStarted = true;
    writableDealWithRejection(state, r);
    if (state.readableStoredError === undefined) {
      state.readableStoredError = r;
    }
    return null;
  });

  const sink = Object.create(null);
  sink.start = (controller: WritableStreamDefaultController) => {
    state.writableController = controller;
    controller.signal.addEventListener('abort', () => {
      // WritableStreamAbort() signals abort right before WritableStreamStartErroring().
      if (state.writableState === 'writable') {
        writableStartErroring(state, controller.signal.reason);
      }
    });
    return startPromise;
  };
  sink.write = (chunk: any) => {
    state.writableInFlight = true;
    const promise = TransformStreamDefaultSinkWriteAlgorithm(stream, chunk);
    uponPromise(promiseResolvedWith(promise), () => {
      state.writableInFlight = false;
      if (state.writableState === 'erroring') {
        state.writableState = 'errored';
      }
      return null;
    }, (r) => {
      state.writableInFlight = false;
      writableDealWithRejection(state, r);
      return null;
    });
    return promise;
  };
  sink.close = () => {
    state.writableInFlight = true;
    const promise = TransformStreamDefaultSinkCloseAlgorithm(stream);
    uponPromise(promiseResolvedWith(promise), () => {
      state.writableInFlight = false;
      state.writableState = 'closed';
      state.writableStoredError = undefined;
      return null;
    }, (r) => {
      state.writableInFlight = false;
      writableDealWithRejection(state, r);
      return null;
    });
    return promise;
  };
  sink.abort = (reason: any) => {
    // The shadow state already became "errored" when the native stream finished erroring,
    // or it will once the standard would have finished erroring (after start or the in-flight write).
    return TransformStreamDefaultSinkAbortAlgorithm(stream, reason);
  };
  const writableStrategy = Object.create(null);
  writableStrategy.highWaterMark = writableHighWaterMark;
  writableStrategy.size = (chunk: any): number => {
    // When size() throws or returns an invalid size, the native stream errors itself without telling the sink.
    // Validate the size here instead, so the shadow state knows about the error.
    try {
      const size = Number(writableSizeAlgorithm(chunk));
      if (!(size >= 0) || size === Infinity) {
        throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
      }
      return size;
    } catch (e) {
      if (state.writableState === 'writable') {
        writableStartErroring(state, e);
      }
      throw e;
    }
  };
  stream._writable = new env.NativeWritableStream(sink, writableStrategy);

  const source = Object.create(null);
  source.start = (controller: ReadableStreamDefaultController) => {
    state.readableController = controller;
    return startPromise;
  };
  source.pull = () => {
    state.readablePullCalled = true;
    state.readablePulling = true;
    return TransformStreamDefaultSourcePullAlgorithm(stream);
  };
  source.cancel = (reason: any) => {
    // ReadableStreamCancel() closes the stream before calling the cancel algorithm.
    state.readableCancelled = true;
    return TransformStreamDefaultSourceCancelAlgorithm(stream, reason);
  };
  const readableStrategy = Object.create(null);
  readableStrategy.highWaterMark = readableHighWaterMark;
  readableStrategy.size = readableSizeAlgorithm;
  stream._readable = new env.NativeReadableStream(source, readableStrategy);
}

function writableStartErroring(state: NativeSidesState, reason: any) {
  state.writableStoredError = reason;
  // WritableStreamStartErroring() finishes erroring right away if nothing is in flight.
  state.writableState = state.writableStarted && !state.writableInFlight ? 'errored' : 'erroring';
}

function writableDealWithRejection(state: NativeSidesState, error: any) {
  if (state.writableState === 'writable') {
    state.writableStoredError = error;
  }
  state.writableState = 'errored';
}

function native(stream: OwnTransformStream): NativeSidesState {
  return (stream as NativeBackedTransformStream)._native;
}

function readableIsErrored(state: NativeSidesState): boolean {
  // ReadableStreamDefaultControllerGetDesiredSize() returns null only when the stream is errored.
  return state.readableController.desiredSize === null;
}

function readableCanCloseOrEnqueue(state: NativeSidesState): boolean {
  return !state.readableCloseRequested && !state.readableCancelled && !readableIsErrored(state);
}

/**
 * The {@link TransformStreamSides} for native readable and writable sides.
 */
const nativeSides: TransformStreamSides = {
  readableGetDesiredSize(stream) {
    return native(stream).readableController.desiredSize;
  },
  readableCanCloseOrEnqueue(stream) {
    return readableCanCloseOrEnqueue(native(stream));
  },
  readableEnqueue(stream, chunk) {
    const state = native(stream);
    try {
      state.readableController.enqueue(chunk);
    } catch (e) {
      // The strategy's size() threw, which errors the native stream.
      if (state.readableStoredError === undefined) {
        state.readableStoredError = e;
      }
      throw e;
    }
    state.readablePulling = false;
  },
  readableHasBackpressure(stream) {
    // !ReadableStreamDefaultControllerShouldCallPull()
    // We can't see the native stream's pending read requests, so we assume that a pull() call means that
    // there's one pending read request, which is fulfilled by the next enqueue().
    const state = native(stream);
    if (!readableCanCloseOrEnqueue(state) || !state.readablePullCalled) {
      return true;
    }
    if (state.readablePulling) {
      return false;
    }
    return !(state.readableController.desiredSize! > 0);
  },
  readableClose(stream) {
    const state = native(stream);
    if (!readableCanCloseOrEnqueue(state)) {
      return;
    }
    state.readableCloseRequested = true;
    state.readableController.close();
  },
  readableError(stream, e) {
    const state = native(stream);
    if (readableIsErrored(state)) {
      return;
    }
    state.readableController.error(e);
    if (readableIsErrored(state)) {
      state.readableStoredError = e;
    }
  },
  readableIsErrored(stream) {
    return readableIsErrored(native(stream));
  },
  readableGetStoredError(stream) {
    return native(stream).readableStoredError;
  },

  writableIsWritable(stream) {
    return native(stream).writableState === 'writable';
  },
  writableIsErroring(stream) {
    return native(stream).writableState === 'erroring';
  },
  writableIsErrored(stream) {
    return native(stream).writableState === 'errored';
  },
  writableGetStoredError(stream) {
    return native(stream).writableStoredError;
  },
  writableErrorIfNeeded(stream, e) {
    const state = native(stream);
    if (state.writableState !== 'writable') {
      return;
    }
    state.writableController.error(e);
    writableStartErroring(state, e);
  }
};

/**
 * Passes the transformer's members to the native constructor, so it doesn't read them a second time.
 * The callbacks are still called with the original transformer as `this`.
 */
function toNativeTransformer(rawTransformer: Transformer | null, members: Transformer): Transformer {
  const { flush, readableType, start, transform, writableType } = members;
  const result: any = Object.create(null);
  if (flush !== undefined) {
    result.flush = (controller: any) => reflectCall(flush, rawTransformer, [controller]);
  }
  if (readableType !== undefined) {
    result.readableType = readableType;
  }
  if (start !== undefined) {
    result.start = (controller: any) => reflectCall(start, rawTransformer, [controller]);
  }
  if (transform !== undefined) {
    result.transform = (chunk: any, controller: any) => reflectCall(transform, rawTransformer, [chunk, controller]);
  }
  if (writableType !== undefined) {
    result.writableType = writableType;
  }
  return result;
}

function hasWritableSignal(WritableStream: any): boolean {
  let result = false;
  try {
    new WritableStream({
      start(controller: any) {
        result = typeof AbortSignal === 'function' && controller.signal instanceof AbortSignal;
      }
    });
  } catch {
    return false;
  }
  return result;
}

function getControllerPrototype(TransformStream: any): any {
  let controller: any;
  new TransformStream({
    start(c: any) {
      controller = c;
    }
  });
  return Object.getPrototypeOf(controller);
}
