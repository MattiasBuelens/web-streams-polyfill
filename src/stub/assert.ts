import { noop } from '../utils';

export const AssertionError = /* @__PURE__*/ class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

function assertImpl(test: boolean, message?: string): asserts test {
  if (!test) {
    throw new AssertionError('Assertion failed' + (message ? `: ${message}` : ''));
  }
}

const assert: typeof assertImpl = DEBUG ? assertImpl : noop;
export default assert;
