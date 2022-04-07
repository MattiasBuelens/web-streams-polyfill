import { QueuingStrategy, QueuingStrategyInit } from './queuing-strategy';
import { typeIsObject } from './helpers/miscellaneous';
import { assertRequiredArgument } from './validators/basic';
import { convertQueuingStrategyInit } from './validators/queuing-strategy-init';

// The size function must not have a prototype property nor be a constructor
const byteLengthSizeFunction = (chunk: ArrayBufferView): number => {
  return chunk.byteLength;
};
try {
  Object.defineProperty(byteLengthSizeFunction, 'name', {
    value: 'size',
    configurable: true
  });
} catch {
  // This property is non-configurable in older browsers, so ignore if this throws.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#browser_compatibility
}

/**
 * A queuing strategy that counts the number of bytes in each chunk.
 *
 * @public
 */
export default class ByteLengthQueuingStrategy implements QueuingStrategy<ArrayBufferView> {
  /** @internal */
  readonly _byteLengthQueuingStrategyHighWaterMark: number;

  constructor(options: QueuingStrategyInit) {
    assertRequiredArgument(options, 1, 'ByteLengthQueuingStrategy');
    options = convertQueuingStrategyInit(options, 'First parameter');
    this._byteLengthQueuingStrategyHighWaterMark = options.highWaterMark;
  }

  /**
   * Returns the high water mark provided to the constructor.
   */
  get highWaterMark(): number {
    if (!IsByteLengthQueuingStrategy(this)) {
      throw byteLengthBrandCheckException('highWaterMark');
    }
    return this._byteLengthQueuingStrategyHighWaterMark;
  }

  /**
   * Measures the size of `chunk` by returning the value of its `byteLength` property.
   */
  get size(): (chunk: ArrayBufferView) => number {
    if (!IsByteLengthQueuingStrategy(this)) {
      throw byteLengthBrandCheckException('size');
    }
    return byteLengthSizeFunction;
  }
}

Object.defineProperties(ByteLengthQueuingStrategy.prototype, {
  highWaterMark: { enumerable: true },
  size: { enumerable: true }
});
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ByteLengthQueuingStrategy.prototype, Symbol.toStringTag, {
    value: 'ByteLengthQueuingStrategy',
    configurable: true
  });
}

// Helper functions for the ByteLengthQueuingStrategy.

function byteLengthBrandCheckException(name: string): TypeError {
  return new TypeError(`ByteLengthQueuingStrategy.prototype.${name} can only be used on a ByteLengthQueuingStrategy`);
}

export function IsByteLengthQueuingStrategy(x: any): x is ByteLengthQueuingStrategy {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_byteLengthQueuingStrategyHighWaterMark')) {
    return false;
  }

  return x instanceof ByteLengthQueuingStrategy;
}
