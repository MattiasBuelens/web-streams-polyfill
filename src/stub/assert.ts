import { noop } from '../utils';

export const AssertionError = /* @__PURE__ */ (() => {
  // eslint-disable-next-line no-shadow
  return class AssertionError extends Error {
  };
})();

function assertImpl(test: boolean, message?: string): asserts test {
  if (!test) {
    throw new AssertionError('Assertion failed' + (message ? `: ${message}` : ''));
  }
}

const assert: typeof assertImpl = DEBUG ? assertImpl : noop;
export default assert;
