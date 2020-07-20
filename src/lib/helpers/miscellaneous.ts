import { globals, noop } from '../../utils';
import { AssertionError } from '../../stub/assert';
import { PerformPromiseThen, promiseResolvedWith } from './webidl';

export function typeIsObject(x: any): x is object {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
}

export const queueMicrotask: (fn: () => void) => void = (() => {
  const globalQueueMicrotask = globals && globals.queueMicrotask;
  if (typeof globalQueueMicrotask === 'function') {
    return globalQueueMicrotask;
  }

  const resolvedPromise = promiseResolvedWith(undefined);
  return (fn: () => void) => PerformPromiseThen(resolvedPromise, fn);
})();

export const rethrowAssertionErrorRejection: (e: any) => void =
  DEBUG ? e => {
    // Used throughout the reference implementation, as `.catch(rethrowAssertionErrorRejection)`, to ensure any errors
    // get shown. There are places in the spec where we do promise transformations and purposefully ignore or don't
    // expect any errors, but assertion errors are always problematic.
    if (e && e instanceof AssertionError) {
      setTimeout(() => {
        throw e;
      }, 0);
    }
  } : noop;
