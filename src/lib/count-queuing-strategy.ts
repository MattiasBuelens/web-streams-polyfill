import { QueuingStrategy } from './queuing-strategy';

const countSizeFunction = ({
  size(): number {
    return 1;
  }
}).size;

export default class CountQueuingStrategy implements QueuingStrategy<any> {
  private readonly _highWaterMark!: number;

  constructor(options: { highWaterMark: number }) {
    if (options !== undefined && typeof options !== 'object' && typeof options !== 'function') {
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
