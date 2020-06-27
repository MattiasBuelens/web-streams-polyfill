import { QueuingStrategy } from './queuing-strategy';
import { isDictionary } from './helpers';

const byteLengthSizeFunction = ({
  size(chunk: ArrayBufferView): number {
    return chunk.byteLength;
  }
}).size;

export default class ByteLengthQueuingStrategy implements QueuingStrategy<ArrayBufferView> {
  private readonly _highWaterMark!: number;

  constructor(options: { highWaterMark: number }) {
    if (options !== undefined && !isDictionary(options)) {
      throw new TypeError(`First parameter is not an object`);
    }
    const highWaterMark = options?.highWaterMark;
    if (highWaterMark === undefined) {
      throw new TypeError(`highWaterMark is required`);
    }
    this._highWaterMark = Number(highWaterMark);
  }

  get highWaterMark(): number {
    return this._highWaterMark;
  }

  get size(): (chunk: ArrayBufferView) => number {
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
