/**
 * The TransformStream abstract operations that are shared between all TransformStream implementations.
 *
 * These only reach the readable and writable sides through the {@link TransformStreamSides} stored on the stream,
 * so this module must not import this library's own ReadableStream or WritableStream.
 * That way, a TransformStream on top of native streams can reuse these without bundling our own streams.
 */

import assert from '../../stub/assert';
import {
  newPromise,
  promiseRejectedWith,
  promiseResolvedWith,
  setPromiseIsHandledToTrue,
  transformPromiseWith,
  uponPromise
} from '../helpers/webidl';
import type { TransformStream, TransformStreamDefaultController } from '../transform-stream';
import type { TransformStreamSides } from './sides';
import type { ValidatedTransformer } from './transformer';

/**
 * Initializes the state that every TransformStream has, regardless of how its sides are implemented.
 * The caller must set up the sides before calling this.
 */
export function InitializeTransformStreamState(stream: TransformStream, sides: TransformStreamSides) {
  stream._sides = sides;

  // The [[backpressure]] slot is set to undefined so that it can be initialised by TransformStreamSetBackpressure.
  stream._backpressure = undefined!;
  stream._backpressureChangePromise = undefined!;
  stream._backpressureChangePromise_resolve = undefined!;
  TransformStreamSetBackpressure(stream, true);

  stream._transformStreamController = undefined!;
}

// This is a no-op if both sides are already errored.
export function TransformStreamError(stream: TransformStream, e: any) {
  stream._sides.readableError(stream, e);
  TransformStreamErrorWritableAndUnblockWrite(stream, e);
}

export function TransformStreamErrorWritableAndUnblockWrite(stream: TransformStream, e: any) {
  TransformStreamDefaultControllerClearAlgorithms(stream._transformStreamController);
  stream._sides.writableErrorIfNeeded(stream, e);
  TransformStreamUnblockWrite(stream);
}

export function TransformStreamUnblockWrite(stream: TransformStream) {
  if (stream._backpressure) {
    // Pretend that pull() was called to permit any pending write() calls to complete. TransformStreamSetBackpressure()
    // cannot be called from enqueue() or pull() once the ReadableStream is errored, so this will will be the final time
    // _backpressure is set.
    TransformStreamSetBackpressure(stream, false);
  }
}

export function TransformStreamSetBackpressure(stream: TransformStream, backpressure: boolean) {
  // Passes also when called during construction.
  assert(stream._backpressure !== backpressure);

  if (stream._backpressureChangePromise !== undefined) {
    stream._backpressureChangePromise_resolve();
  }

  stream._backpressureChangePromise = newPromise((resolve) => {
    stream._backpressureChangePromise_resolve = resolve;
  });

  stream._backpressure = backpressure;
}

// Transform Stream Default Controller Abstract Operations

export function SetUpTransformStreamDefaultController<I, O>(
  stream: TransformStream<I, O>,
  controller: TransformStreamDefaultController<O>,
  transformAlgorithm: (chunk: I) => Promise<void>,
  flushAlgorithm: () => Promise<void>,
  cancelAlgorithm: (reason: any) => Promise<void>
) {
  assert(stream._transformStreamController === undefined);

  controller._controlledTransformStream = stream;
  stream._transformStreamController = controller;

  controller._transformAlgorithm = transformAlgorithm;
  controller._flushAlgorithm = flushAlgorithm;
  controller._cancelAlgorithm = cancelAlgorithm;
  controller._transformRejectCallback = undefined;

  controller._finishPromise = undefined;
  controller._finishPromise_resolve = undefined;
  controller._finishPromise_reject = undefined;
}

export function SetUpTransformStreamDefaultControllerFromTransformer<I, O>(
  stream: TransformStream<I, O>,
  controller: TransformStreamDefaultController<O>,
  transformer: ValidatedTransformer<I, O>
) {
  let transformAlgorithm: (chunk: I) => Promise<void>;
  let flushAlgorithm: () => Promise<void>;
  let cancelAlgorithm: (reason: any) => Promise<void>;

  if (transformer.transform !== undefined) {
    transformAlgorithm = chunk => transformer.transform!(chunk, controller);
  } else {
    transformAlgorithm = (chunk) => {
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

export function TransformStreamDefaultControllerClearAlgorithms(controller: TransformStreamDefaultController<any>) {
  controller._transformAlgorithm = undefined!;
  controller._flushAlgorithm = undefined!;
  controller._cancelAlgorithm = undefined!;
  controller._transformRejectCallback = undefined;
}

export function TransformStreamDefaultControllerEnqueue<O>(controller: TransformStreamDefaultController<O>, chunk: O) {
  const stream = controller._controlledTransformStream;
  if (!stream._sides.readableCanCloseOrEnqueue(stream)) {
    throw new TypeError('Readable side is not in a state that permits enqueue');
  }

  // We throttle transform invocations based on the backpressure of the ReadableStream, but we still
  // accept TransformStreamDefaultControllerEnqueue() calls.

  try {
    stream._sides.readableEnqueue(stream, chunk);
  } catch (e) {
    // This happens when readableStrategy.size() throws.
    TransformStreamErrorWritableAndUnblockWrite(stream, e);

    throw stream._sides.readableGetStoredError(stream);
  }

  const backpressure = stream._sides.readableHasBackpressure(stream);
  if (backpressure !== stream._backpressure) {
    assert(backpressure);
    TransformStreamSetBackpressure(stream, true);
  }
}

export function TransformStreamDefaultControllerError(controller: TransformStreamDefaultController<any>, e: any) {
  TransformStreamError(controller._controlledTransformStream, e);
}

export function TransformStreamDefaultControllerPerformTransform<I, O>(
  controller: TransformStreamDefaultController<O>,
  chunk: I
) {
  let transformRejectCallback = controller._transformRejectCallback;
  if (transformRejectCallback === undefined) {
    // Optimization: create transform() promise callbacks on first use, and re-use for all subsequent calls.
    transformRejectCallback = (r) => {
      TransformStreamError(controller._controlledTransformStream, r);
      throw r;
    };
    controller._transformRejectCallback = transformRejectCallback;
  }

  const transformPromise = controller._transformAlgorithm(chunk);
  return transformPromiseWith(transformPromise, undefined, transformRejectCallback);
}

export function TransformStreamDefaultControllerTerminate<O>(controller: TransformStreamDefaultController<O>) {
  const stream = controller._controlledTransformStream;

  stream._sides.readableClose(stream);

  const error = new TypeError('TransformStream terminated');
  TransformStreamErrorWritableAndUnblockWrite(stream, error);
}

// TransformStreamDefaultSink Algorithms

export function TransformStreamDefaultSinkWriteAlgorithm<I, O>(stream: TransformStream<I, O>, chunk: I): Promise<void> {
  assert(stream._sides.writableIsWritable(stream));

  const controller = stream._transformStreamController;

  if (stream._backpressure) {
    const backpressureChangePromise = stream._backpressureChangePromise;
    assert(backpressureChangePromise !== undefined);
    return transformPromiseWith(backpressureChangePromise, () => {
      if (stream._sides.writableIsErroring(stream)) {
        throw stream._sides.writableGetStoredError(stream);
      }
      assert(stream._sides.writableIsWritable(stream));
      return TransformStreamDefaultControllerPerformTransform<I, O>(controller, chunk);
    });
  }

  return TransformStreamDefaultControllerPerformTransform<I, O>(controller, chunk);
}

export function TransformStreamDefaultSinkAbortAlgorithm<I, O>(stream: TransformStream<I, O>, reason: any): Promise<void> {
  const controller = stream._transformStreamController;
  if (controller._finishPromise !== undefined) {
    return controller._finishPromise;
  }

  // Assign the _finishPromise now so that if _cancelAlgorithm calls readable.cancel() internally,
  // we don't run the _cancelAlgorithm again.
  controller._finishPromise = newPromise((resolve, reject) => {
    controller._finishPromise_resolve = resolve;
    controller._finishPromise_reject = reject;
  });

  const cancelPromise = controller._cancelAlgorithm(reason);
  TransformStreamDefaultControllerClearAlgorithms(controller);

  uponPromise(cancelPromise, () => {
    if (stream._sides.readableIsErrored(stream)) {
      defaultControllerFinishPromiseReject(controller, stream._sides.readableGetStoredError(stream));
    } else {
      stream._sides.readableError(stream, reason);
      defaultControllerFinishPromiseResolve(controller);
    }
    return null;
  }, (r) => {
    stream._sides.readableError(stream, r);
    defaultControllerFinishPromiseReject(controller, r);
    return null;
  });

  return controller._finishPromise;
}

export function TransformStreamDefaultSinkCloseAlgorithm<I, O>(stream: TransformStream<I, O>): Promise<void> {
  const controller = stream._transformStreamController;
  if (controller._finishPromise !== undefined) {
    return controller._finishPromise;
  }

  // Assign the _finishPromise now so that if _flushAlgorithm calls readable.cancel() internally,
  // we don't also run the _cancelAlgorithm.
  controller._finishPromise = newPromise((resolve, reject) => {
    controller._finishPromise_resolve = resolve;
    controller._finishPromise_reject = reject;
  });

  const flushPromise = controller._flushAlgorithm();
  TransformStreamDefaultControllerClearAlgorithms(controller);

  uponPromise(flushPromise, () => {
    if (stream._sides.readableIsErrored(stream)) {
      defaultControllerFinishPromiseReject(controller, stream._sides.readableGetStoredError(stream));
    } else {
      stream._sides.readableClose(stream);
      defaultControllerFinishPromiseResolve(controller);
    }
    return null;
  }, (r) => {
    stream._sides.readableError(stream, r);
    defaultControllerFinishPromiseReject(controller, r);
    return null;
  });

  return controller._finishPromise;
}

// TransformStreamDefaultSource Algorithms

export function TransformStreamDefaultSourcePullAlgorithm(stream: TransformStream): Promise<void> {
  // Invariant. Enforced by the promises returned by start() and pull().
  assert(stream._backpressure);

  assert(stream._backpressureChangePromise !== undefined);

  TransformStreamSetBackpressure(stream, false);

  // Prevent the next pull() call until there is backpressure.
  return stream._backpressureChangePromise;
}

export function TransformStreamDefaultSourceCancelAlgorithm<I, O>(stream: TransformStream<I, O>, reason: any): Promise<void> {
  const controller = stream._transformStreamController;
  if (controller._finishPromise !== undefined) {
    return controller._finishPromise;
  }

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
    if (stream._sides.writableIsErrored(stream)) {
      defaultControllerFinishPromiseReject(controller, stream._sides.writableGetStoredError(stream));
    } else {
      stream._sides.writableErrorIfNeeded(stream, reason);
      TransformStreamUnblockWrite(stream);
      defaultControllerFinishPromiseResolve(controller);
    }
    return null;
  }, (r) => {
    stream._sides.writableErrorIfNeeded(stream, r);
    TransformStreamUnblockWrite(stream);
    defaultControllerFinishPromiseReject(controller, r);
    return null;
  });

  return controller._finishPromise;
}

// Helper functions for the TransformStreamDefaultController.

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
