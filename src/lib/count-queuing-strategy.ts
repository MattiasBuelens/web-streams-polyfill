import { QueuingStrategy } from './queuing-strategy';
import { isDictionary, typeIsObject } from './helpers';

const countSizeFunction = ({
  size(): number {
    return 1;
  }
}).size;

export default class CountQueuingStrategy implements QueuingStrategy<any> {
  private readonly _countQueuingStrategyHighWaterMark!: number;

  constructor(options: { highWaterMark: number }) {
    if (options !== undefined && !isDictionary(options)) {
      throw new TypeError(`First parameter is not an object`);
    }
    const highWaterMark = options?.highWaterMark;
    if (highWaterMark === undefined) {
      throw new TypeError(`highWaterMark is required`);
    }
    this._countQueuingStrategyHighWaterMark = Number(highWaterMark);
  }

  get highWaterMark(): number {
    if (IsCountQueuingStrategy(this) === false) {
      throw countBrandCheckException('highWaterMark');
    }
    return this._countQueuingStrategyHighWaterMark;
  }

  get size(): (chunk: any) => number {
    if (IsCountQueuingStrategy(this) === false) {
      throw countBrandCheckException('size');
    }
    return countSizeFunction;
  }
}

Object.defineProperties(CountQueuingStrategy.prototype, {
  highWaterMark: { enumerable: true },
  size: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(CountQueuingStrategy.prototype, Symbol.toStringTag, {
    value: 'CountQueuingStrategy',
    configurable: true
  });
}

// Helper functions for the CountQueuingStrategy.

function countBrandCheckException(name: string): TypeError {
  return new TypeError(`CountQueuingStrategy.prototype.${name} can only be used on a CountQueuingStrategy`);
}

export function IsCountQueuingStrategy(x: any): x is CountQueuingStrategy {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_countQueuingStrategyHighWaterMark')) {
    return false;
  }

  return true;
}
