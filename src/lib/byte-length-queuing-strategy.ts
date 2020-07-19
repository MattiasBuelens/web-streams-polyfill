import { QueuingStrategy, QueuingStrategyInit } from './queuing-strategy';
import { typeIsObject } from './helpers/miscellaneous';
import { assertRequiredArgument } from './validators/basic';
import { convertQueuingStrategyInit } from './validators/queuing-strategy-init';

const byteLengthSizeFunction = function size(chunk: ArrayBufferView): number {
  return chunk.byteLength;
};

export default class ByteLengthQueuingStrategy implements QueuingStrategy<ArrayBufferView> {
  /** @internal */
  readonly _byteLengthQueuingStrategyHighWaterMark: number;

  constructor(options: QueuingStrategyInit) {
    assertRequiredArgument(options, 1, 'ByteLengthQueuingStrategy');
    options = convertQueuingStrategyInit(options, 'First parameter');
    this._byteLengthQueuingStrategyHighWaterMark = options.highWaterMark;
  }

  get highWaterMark(): number {
    if (!IsByteLengthQueuingStrategy(this)) {
      throw byteLengthBrandCheckException('highWaterMark');
    }
    return this._byteLengthQueuingStrategyHighWaterMark;
  }

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

  return true;
}
