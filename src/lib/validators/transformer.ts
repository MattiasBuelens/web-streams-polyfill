import { assertDictionary, assertFunction } from './basic';
import { promiseCall, reflectCall } from '../helpers/webidl';
import {
  Transformer,
  TransformerFlushCallback,
  TransformerStartCallback,
  TransformerTransformCallback,
  ValidatedTransformer
} from '../transform-stream/transformer';
import { TransformStreamDefaultController } from '../transform-stream';

export function convertTransformer<I, O>(original: Transformer<I, O> | null,
                                         context: string): ValidatedTransformer<I, O> {
  assertDictionary(original, context);
  const flush = original?.flush;
  const readableType = original?.readableType;
  const start = original?.start;
  const transform = original?.transform;
  const writableType = original?.writableType;
  return {
    flush: flush === undefined ?
      undefined :
      convertTransformerFlushCallback(flush, original!, `${context} has member 'flush' that`),
    readableType,
    start: start === undefined ?
      undefined :
      convertTransformerStartCallback(start, original!, `${context} has member 'start' that`),
    transform: transform === undefined ?
      undefined :
      convertTransformerTransformCallback(transform, original!, `${context} has member 'transform' that`),
    writableType
  };
}

function convertTransformerFlushCallback<I, O>(
  fn: TransformerFlushCallback<O>,
  original: Transformer<I, O>,
  context: string
): (controller: TransformStreamDefaultController<O>) => Promise<void> {
  assertFunction(fn, context);
  return (controller: TransformStreamDefaultController<O>) => promiseCall(fn, original, [controller]);
}

function convertTransformerStartCallback<I, O>(
  fn: TransformerStartCallback<O>,
  original: Transformer<I, O>,
  context: string
): TransformerStartCallback<O> {
  assertFunction(fn, context);
  return (controller: TransformStreamDefaultController<O>) => reflectCall(fn, original, [controller]);
}

function convertTransformerTransformCallback<I, O>(
  fn: TransformerTransformCallback<I, O>,
  original: Transformer<I, O>,
  context: string
): (chunk: I, controller: TransformStreamDefaultController<O>) => Promise<void> {
  assertFunction(fn, context);
  return (chunk: I, controller: TransformStreamDefaultController<O>) => promiseCall(fn, original, [chunk, controller]);
}
