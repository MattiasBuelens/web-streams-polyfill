import { QueuingStrategy } from './queuing-strategy';

export default class ByteLengthQueuingStrategy implements QueuingStrategy<ArrayBufferView> {
  readonly highWaterMark!: number;

  constructor({ highWaterMark }: { highWaterMark: number }) {
    this.highWaterMark = highWaterMark;
  }

  size(chunk: ArrayBufferView): number {
    return chunk.byteLength;
  }
}
