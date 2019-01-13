import { noop } from '../utils';

export default function assert(test: boolean): void {
  // do nothing
}

assert.AssertionError = noop;
