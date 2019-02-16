import { createDataProperty } from './helpers';
import { QueuingStrategy } from './queuing-strategy';

export default class CountQueuingStrategy implements QueuingStrategy<any> {
  readonly highWaterMark!: number;

  constructor({ highWaterMark }: { highWaterMark: number }) {
    createDataProperty(this, 'highWaterMark', highWaterMark);
  }

  size(): 1 {
    return 1;
  }
}
