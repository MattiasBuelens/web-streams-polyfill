import { QueuingStrategy, QueuingStrategyInit } from './queuing-strategy';
import { typeIsObject } from './helpers/miscellaneous';
import { assertRequiredArgument } from './validators/basic';
import { convertQueuingStrategyInit } from './validators/queuing-strategy-init';

// The size function must not have a prototype property nor be a constructor
const countSizeFunction = (): 1 => {
  return 1;
};
try {
  Object.defineProperty(countSizeFunction, 'name', {
    value: 'size',
    configurable: true
  });
} catch {
  // This property is non-configurable in older browsers, so ignore if this throws.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#browser_compatibility
}

/**
 * A queuing strategy that counts the number of chunks.
 *
 * @public
 */
export default class CountQueuingStrategy implements QueuingStrategy<any> {
  /** @internal */
  readonly _countQueuingStrategyHighWaterMark!: number;

  constructor(options: QueuingStrategyInit) {
    assertRequiredArgument(options, 1, 'CountQueuingStrategy');
    options = convertQueuingStrategyInit(options, 'First parameter');
    this._countQueuingStrategyHighWaterMark = options.highWaterMark;
  }

  /**
   * Returns the high water mark provided to the constructor.
   */
  get highWaterMark(): number {
    if (!IsCountQueuingStrategy(this)) {
      throw countBrandCheckException('highWaterMark');
    }
    return this._countQueuingStrategyHighWaterMark;
  }

  /**
   * Measures the size of `chunk` by always returning 1.
   * This ensures that the total queue size is a count of the number of chunks in the queue.
   */
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

  return x instanceof CountQueuingStrategy;
}
