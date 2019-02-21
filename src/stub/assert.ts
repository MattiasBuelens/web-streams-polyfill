import { noop } from '../utils';

export default function assert(test: boolean): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  return; // do nothing
}

assert.AssertionError = noop;
