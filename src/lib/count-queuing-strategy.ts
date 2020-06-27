import { QueuingStrategy } from './queuing-strategy';
import { isDictionary } from './helpers';

const countSizeFunction = ({
  size(): number {
    return 1;
  }
}).size;

export default class CountQueuingStrategy implements QueuingStrategy<any> {
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

  get size(): (chunk: any) => number {
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
