import { noop } from '../../utils';
import { AssertionError } from '../../stub/assert';

export function typeIsObject(x: any): x is object {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
}

export const rethrowAssertionErrorRejection: (e: any) => void =
  DEBUG ?
    (e) => {
    // Used throughout the reference implementation, as `.catch(rethrowAssertionErrorRejection)`, to ensure any errors
    // get shown. There are places in the spec where we do promise transformations and purposefully ignore or don't
    // expect any errors, but assertion errors are always problematic.
      if (e && e instanceof AssertionError) {
        setTimeout(() => {
          throw e;
        }, 0);
      }
    } :
    noop;

export function setFunctionName(fn: (...args: any[]) => any, name: string): void {
  try {
    Object.defineProperty(fn, 'name', {
      value: name,
      configurable: true
    });
  } catch {
    // This property is non-configurable in older browsers, so ignore if this throws.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#browser_compatibility
  }
}
