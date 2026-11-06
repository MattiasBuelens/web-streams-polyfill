import { assertDictionary, assertFunction } from './basic';
import { promiseCall, reflectCall } from '../helpers/webidl';
import type { Transformer, ValidatedTransformer } from '../transform-stream/transformer';
import type { TransformStreamDefaultController } from '../transform-stream';

/**
 * Reads and validates the members of a transformer dictionary, without wrapping its callbacks.
 */
export function readTransformer<I, O>(
  original: Transformer<I, O> | null,
  context: string
): Transformer<I, O> {
  assertDictionary(original, context);
  const cancel = original?.cancel;
  const flush = original?.flush;
  const readableType = original?.readableType;
  const start = original?.start;
  const transform = original?.transform;
  const writableType = original?.writableType;
  if (cancel !== undefined) {
    assertFunction(cancel, `${context} has member 'cancel' that`);
  }
  if (flush !== undefined) {
    assertFunction(flush, `${context} has member 'flush' that`);
  }
  if (start !== undefined) {
    assertFunction(start, `${context} has member 'start' that`);
  }
  if (transform !== undefined) {
    assertFunction(transform, `${context} has member 'transform' that`);
  }
  return { cancel, flush, readableType, start, transform, writableType };
}

/**
 * Wraps the callbacks of a transformer that was read by {@link readTransformer},
 * so they're called with the original transformer as `this`.
 */
export function wrapTransformer<I, O>(
  members: Transformer<I, O>,
  original: Transformer<I, O> | null
): ValidatedTransformer<I, O> {
  const { cancel, flush, readableType, start, transform, writableType } = members;
  return {
    cancel: cancel === undefined
      ? undefined
      : (reason: any) => promiseCall(cancel, original, [reason]),
    flush: flush === undefined
      ? undefined
      : (controller: TransformStreamDefaultController<O>) => promiseCall(flush, original, [controller]),
    readableType,
    start: start === undefined
      ? undefined
      : (controller: TransformStreamDefaultController<O>) => reflectCall(start, original, [controller]),
    transform: transform === undefined
      ? undefined
      : (chunk: I, controller: TransformStreamDefaultController<O>) => promiseCall(transform, original, [chunk, controller]),
    writableType
  };
}

export function convertTransformer<I, O>(
  original: Transformer<I, O> | null,
  context: string
): ValidatedTransformer<I, O> {
  return wrapTransformer(readTransformer(original, context), original);
}
