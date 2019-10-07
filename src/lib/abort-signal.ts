/**
 * A signal object that allows you to communicate with a request and abort it if required
 * via its associated `AbortController` object.
 *
 * @remarks
 *   This interface is compatible with the `AbortSignal` interface defined in TypeScript's DOM types.
 *   It is redefined here, so it can be polyfilled without a DOM, for example with
 *   {@link https://www.npmjs.com/package/abortcontroller-polyfill | abortcontroller-polyfill} in a Node environment.
 */
export interface AbortSignal {
  readonly aborted: boolean;

  addEventListener(type: 'abort', listener: () => void): void;

  removeEventListener(type: 'abort', listener: () => void): void;
}

export function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  try {
    return typeof (value as AbortSignal).aborted === 'boolean';
  } catch {
    // AbortSignal.prototype.aborted throws if its brand check fails
    return false;
  }
}
