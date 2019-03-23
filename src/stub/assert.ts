/* global DEBUG */
import { noop } from '../utils';

export const AssertionError = /*@__PURE__*/ class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, this.constructor);
  }
};

const assert: (test: boolean, message?: string) => void =
  DEBUG ? (test, message) => {
    if (!test) {
      throw new AssertionError(`Assertion failed: ${message}`);
    }
  } : noop;

export default assert;
