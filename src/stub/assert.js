import { noop } from '../utils';

export default function assert() {
  // do nothing
}

assert.AssertionError = noop;
