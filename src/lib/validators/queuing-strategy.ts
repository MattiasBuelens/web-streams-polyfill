import type { QueuingStrategy, QueuingStrategySizeCallback } from '../queuing-strategy.ts';
import { assertDictionary, assertFunction, convertUnrestrictedDouble } from './basic.ts';

export function convertQueuingStrategy<T>(
  init: QueuingStrategy<T> | null | undefined,
  context: string
): QueuingStrategy<T> {
  assertDictionary(init, context);
  const highWaterMark = init?.highWaterMark;
  const size = init?.size;
  return {
    highWaterMark: highWaterMark === undefined ? undefined : convertUnrestrictedDouble(highWaterMark),
    size: size === undefined ? undefined : convertQueuingStrategySize(size, `${context} has member 'size' that`)
  };
}

function convertQueuingStrategySize<T>(
  fn: QueuingStrategySizeCallback<T>,
  context: string
): QueuingStrategySizeCallback<T> {
  assertFunction(fn, context);
  return chunk => convertUnrestrictedDouble(fn(chunk));
}
