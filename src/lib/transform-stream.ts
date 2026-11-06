import assert from '../stub/assert';
import { newPromise } from './helpers/webidl';
import { CreateReadableStream, type DefaultReadableStream, ReadableStream } from './readable-stream';
import type { QueuingStrategy, QueuingStrategySizeCallback } from './queuing-strategy';
import { CreateWritableStream, WritableStream } from './writable-stream';
import { referenceSides, type TransformStreamSides } from './transform-stream/sides';
import { setFunctionName, typeIsObject } from './helpers/miscellaneous';
import { IsNonNegativeNumber } from './abstract-ops/miscellaneous';
import { convertQueuingStrategy } from './validators/queuing-strategy';
import { defaultSizeAlgorithm, ExtractHighWaterMark, ExtractSizeAlgorithm } from './abstract-ops/queuing-strategy';
import type {
  Transformer,
  TransformerCancelCallback,
  TransformerFlushCallback,
  TransformerStartCallback,
  TransformerTransformCallback
} from './transform-stream/transformer';
import { convertTransformer } from './validators/transformer';
import {
  InitializeTransformStreamState,
  SetUpTransformStreamDefaultController,
  SetUpTransformStreamDefaultControllerFromTransformer,
  TransformStreamDefaultControllerEnqueue,
  TransformStreamDefaultControllerError,
  TransformStreamDefaultControllerTerminate,
  TransformStreamDefaultSinkAbortAlgorithm,
  TransformStreamDefaultSinkCloseAlgorithm,
  TransformStreamDefaultSinkWriteAlgorithm,
  TransformStreamDefaultSourceCancelAlgorithm,
  TransformStreamDefaultSourcePullAlgorithm
} from './transform-stream/core';

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
  _readable!: DefaultReadableStream<O>;
  /** @internal */
  _sides!: TransformStreamSides;
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
  constructor(
    rawTransformer: Transformer<I, O> | null | undefined = {},
    rawWritableStrategy: QueuingStrategy<I> | null | undefined = {},
    rawReadableStrategy: QueuingStrategy<O> | null | undefined = {}
  ) {
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
    const startPromise = newPromise<void>((resolve) => {
      startPromise_resolve = resolve;
    });

    InitializeTransformStream(this, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm);
    const controller: TransformStreamDefaultController<O> = Object.create(TransformStreamDefaultController.prototype);
    SetUpTransformStreamDefaultControllerFromTransformer(this, controller, transformer);

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

export function CreateTransformStream<I, O>(
  startAlgorithm: () => void | PromiseLike<void>,
  transformAlgorithm: (chunk: I) => Promise<void>,
  flushAlgorithm: () => Promise<void>,
  cancelAlgorithm: (reason: any) => Promise<void>,
  writableHighWaterMark = 1,
  writableSizeAlgorithm: QueuingStrategySizeCallback<I> = defaultSizeAlgorithm,
  readableHighWaterMark = 0,
  readableSizeAlgorithm: QueuingStrategySizeCallback<O> = defaultSizeAlgorithm
) {
  assert(IsNonNegativeNumber(writableHighWaterMark));
  assert(IsNonNegativeNumber(readableHighWaterMark));

  const stream: TransformStream<I, O> = Object.create(TransformStream.prototype);

  let startPromise_resolve!: (value: void | PromiseLike<void>) => void;
  const startPromise = newPromise<void>((resolve) => {
    startPromise_resolve = resolve;
  });

  InitializeTransformStream(
    stream, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark,
    readableSizeAlgorithm
  );

  const controller: TransformStreamDefaultController<O> = Object.create(TransformStreamDefaultController.prototype);

  SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm);

  const startResult = startAlgorithm();
  startPromise_resolve(startResult);
  return stream;
}

function InitializeTransformStream<I, O>(
  stream: TransformStream<I, O>,
  startPromise: Promise<void>,
  writableHighWaterMark: number,
  writableSizeAlgorithm: QueuingStrategySizeCallback<I>,
  readableHighWaterMark: number,
  readableSizeAlgorithm: QueuingStrategySizeCallback<O>
) {
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

  stream._writable = CreateWritableStream(
    startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm,
    writableHighWaterMark, writableSizeAlgorithm
  );

  function pullAlgorithm(): Promise<void> {
    return TransformStreamDefaultSourcePullAlgorithm(stream);
  }

  function cancelAlgorithm(reason: any): Promise<void> {
    return TransformStreamDefaultSourceCancelAlgorithm(stream, reason);
  }

  stream._readable = CreateReadableStream(
    startAlgorithm, pullAlgorithm, cancelAlgorithm, readableHighWaterMark,
    readableSizeAlgorithm
  );

  InitializeTransformStreamState(stream, referenceSides);
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
  _transformRejectCallback: ((r: any) => never) | undefined;
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

    const stream = this._controlledTransformStream;
    return stream._sides.readableGetDesiredSize(stream);
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

// Helper functions for the TransformStreamDefaultController.

function defaultControllerBrandCheckException(name: string): TypeError {
  return new TypeError(`TransformStreamDefaultController.prototype.${name} can only be used on a TransformStreamDefaultController`);
}

// Helper functions for the TransformStream.

function streamBrandCheckException(name: string): TypeError {
  return new TypeError(`TransformStream.prototype.${name} can only be used on a TransformStream`);
}
