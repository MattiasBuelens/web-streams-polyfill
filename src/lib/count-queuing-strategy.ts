import { QueuingStrategy, QueuingStrategyInit } from './queuing-strategy';
import { typeIsObject } from './helpers/miscellaneous';
import { assertRequiredArgument } from './validators/basic';
import { convertQueuingStrategyInit } from './validators/queuing-strategy-init';

const countSizeFunction = function size(): 1 {
  return 1;
};

export default class CountQueuingStrategy implements QueuingStrategy<any> {
  /** @internal */
  readonly _countQueuingStrategyHighWaterMark!: number;

  constructor(options: QueuingStrategyInit) {
    assertRequiredArgument(options, 1, 'CountQueuingStrategy');
    options = convertQueuingStrategyInit(options, 'First parameter');
    this._countQueuingStrategyHighWaterMark = options.highWaterMark;
  }

  get highWaterMark(): number {
    if (!IsCountQueuingStrategy(this)) {
      throw countBrandCheckException('highWaterMark');
    }
    return this._countQueuingStrategyHighWaterMark;
  }

  get size(): (chunk: any) => 1 {
    if (!IsCountQueuingStrategy(this)) {
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
