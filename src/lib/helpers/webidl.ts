import { rethrowAssertionErrorRejection } from './miscellaneous';
import assert from '../../stub/assert';

const originalPromise = Promise;
const originalPromiseResolve = Promise.resolve.bind(originalPromise);
const originalPromiseThen = Promise.prototype.then;
const originalPromiseReject = Promise.reject.bind(originalPromise);

export const promiseResolve = originalPromiseResolve;

// https://webidl.spec.whatwg.org/#a-new-promise
export function newPromise<T>(executor: (
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: any) => void
) => void): Promise<T> {
  return new originalPromise(executor);
}

// https://webidl.spec.whatwg.org/#a-promise-resolved-with
export function promiseResolvedWith<T>(value: T | PromiseLike<T>): Promise<T> {
  return newPromise(resolve => resolve(value));
}

// https://webidl.spec.whatwg.org/#a-promise-rejected-with
export function promiseRejectedWith<T = never>(reason: any): Promise<T> {
  return originalPromiseReject(reason);
}

export function PerformPromiseThen<T, TResult1 = T, TResult2 = never>(
  promise: Promise<T>,
  onFulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>,
  onRejected?: (reason: any) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2> {
  // There doesn't appear to be any way to correctly emulate the behaviour from JavaScript, so this is just an
  // approximation.
  return originalPromiseThen.call(promise, onFulfilled, onRejected) as Promise<TResult1 | TResult2>;
}

// Bluebird logs a warning when a promise is created within a fulfillment handler, but then isn't returned
// from that handler. To prevent this, return null instead of void from all handlers.
// http://bluebirdjs.com/docs/warning-explanations.html#warning-a-promise-was-created-in-a-handler-but-was-not-returned-from-it
export function uponPromise<T>(
  promise: Promise<T>,
  onFulfilled?: (value: T) => null | PromiseLike<null>,
  onRejected?: (reason: any) => null | PromiseLike<null>): void {
  PerformPromiseThen(
    PerformPromiseThen(promise, onFulfilled, onRejected),
    undefined,
    rethrowAssertionErrorRejection
  );
}

export function uponFulfillment<T>(promise: Promise<T>, onFulfilled: (value: T) => null | PromiseLike<null>): void {
  uponPromise(promise, onFulfilled);
}

export function uponRejection(promise: Promise<unknown>, onRejected: (reason: any) => null | PromiseLike<null>): void {
  uponPromise(promise, undefined, onRejected);
}

export function transformPromiseWith<T, TResult1 = T, TResult2 = never>(
  promise: Promise<T>,
  fulfillmentHandler?: (value: T) => TResult1 | PromiseLike<TResult1>,
  rejectionHandler?: (reason: any) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2> {
  return PerformPromiseThen(promise, fulfillmentHandler, rejectionHandler);
}

export function setPromiseIsHandledToTrue(promise: Promise<unknown>): void {
  PerformPromiseThen(promise, undefined, rethrowAssertionErrorRejection);
}

let _queueMicrotask: (callback: () => void) => void = (callback) => {
  if (typeof queueMicrotask === 'function') {
    _queueMicrotask = queueMicrotask;
  } else {
    const resolvedPromise = promiseResolvedWith(undefined);
    _queueMicrotask = cb => PerformPromiseThen(resolvedPromise, cb);
  }
  return _queueMicrotask(callback);
};

export { _queueMicrotask as queueMicrotask };

export function reflectCall<T, A extends any[], R>(F: (this: T, ...fnArgs: A) => R, V: T, args: A): R {
  if (typeof F !== 'function') {
    throw new TypeError('Argument is not a function');
  }
  return Function.prototype.apply.call(F, V, args);
}

export function promiseCall<T, A extends any[], R>(F: (this: T, ...fnArgs: A) => R | PromiseLike<R>,
                                                   V: T,
                                                   args: A): Promise<R> {
  assert(typeof F === 'function');
  assert(V !== undefined);
  assert(Array.isArray(args));
  try {
    return promiseResolvedWith(reflectCall(F, V, args));
  } catch (value) {
    return promiseRejectedWith(value);
  }
}
