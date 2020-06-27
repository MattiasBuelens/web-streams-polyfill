import { QueuingStrategy } from './queuing-strategy';
import { isDictionary, typeIsObject } from './helpers';

const byteLengthSizeFunction = function size(chunk: ArrayBufferView): number {
  return chunk.byteLength;
};

export default class ByteLengthQueuingStrategy implements QueuingStrategy<ArrayBufferView> {
  private readonly _byteLengthQueuingStrategyHighWaterMark!: number;

  constructor(options: { highWaterMark: number }) {
    if (options !== undefined && !isDictionary(options)) {
      throw new TypeError(`First parameter is not an object`);
    }
    const highWaterMark = options?.highWaterMark;
    if (highWaterMark === undefined) {
      throw new TypeError(`highWaterMark is required`);
    }
    this._byteLengthQueuingStrategyHighWaterMark = Number(highWaterMark);
  }

  get highWaterMark(): number {
    if (IsByteLengthQueuingStrategy(this) === false) {
      throw byteLengthBrandCheckException('highWaterMark');
    }
    return this._byteLengthQueuingStrategyHighWaterMark;
  }

  get size(): (chunk: ArrayBufferView) => number {
    if (IsByteLengthQueuingStrategy(this) === false) {
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
