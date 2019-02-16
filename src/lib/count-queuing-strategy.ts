import { createDataProperty } from './helpers';
import { QueuingStrategy } from './queuing-strategy';

export default class CountQueuingStrategy implements QueuingStrategy<any> {
  constructor({ highWaterMark }: { highWaterMark: number }) {
    createDataProperty(this, 'highWaterMark', highWaterMark);
  }

  size() {
    return 1;
  }
}
