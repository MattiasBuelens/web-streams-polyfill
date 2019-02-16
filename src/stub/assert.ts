import { noop } from '../utils';

export default function assert(test: boolean): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // do nothing
}

assert.AssertionError = noop;
