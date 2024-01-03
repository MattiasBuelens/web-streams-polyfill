import { noop } from '../utils';

export const AssertionError = /* @__PURE__ */ (() => {
  // eslint-disable-next-line no-shadow
  return class AssertionError extends Error {
  };
})();

const assert: (test: boolean, message?: string) => void =
  DEBUG ? (test, message) => {
    if (!test) {
      throw new AssertionError('Assertion failed' + (message ? `: ${message}` : ''));
    }
  } : noop;

export default assert;
