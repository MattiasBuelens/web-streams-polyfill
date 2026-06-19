import type { QueuingStrategy, QueuingStrategySizeCallback } from '../queuing-strategy';
import NumberIsNaN from '../../stub/number-isnan';

export function ExtractHighWaterMark(strategy: QueuingStrategy, defaultHWM: number): number {
  const { highWaterMark } = strategy;

  if (highWaterMark === undefined) {
    return defaultHWM;
  }

  if (NumberIsNaN(highWaterMark) || highWaterMark < 0) {
    throw new RangeError('Invalid highWaterMark');
  }

  return highWaterMark;
}

export const defaultSizeAlgorithm: QueuingStrategySizeCallback<unknown> = () => 1;

export function ExtractSizeAlgorithm<T>(strategy: QueuingStrategy<T>): QueuingStrategySizeCallback<T> {
  const { size } = strategy;

  if (!size) {
    return defaultSizeAlgorithm;
  }

  return size;
}
