import { rethrowAssertionErrorRejection } from './miscellaneous';

const originalPromise = Promise;
const originalPromiseThen = Promise.prototype.then;
const originalPromiseResolve = Promise.resolve.bind(originalPromise);
const originalPromiseReject = Promise.reject.bind(originalPromise);

export function newPromise<T>(executor: (
  resolve: (value?: T | PromiseLike<T>) => void,
  reject: (reason?: any) => void
) => void): Promise<T> {
  return new originalPromise(executor);
}

export function promiseResolvedWith<T>(value: T | PromiseLike<T>): Promise<T> {
  return originalPromiseResolve(value);
}

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

export function uponPromise<T>(
  promise: Promise<T>,
  onFulfilled?: (value: T) => void | PromiseLike<void>,
  onRejected?: (reason: any) => void | PromiseLike<void>): void {
  PerformPromiseThen(
    PerformPromiseThen(promise, onFulfilled, onRejected),
    undefined,
    rethrowAssertionErrorRejection
  );
}

export function uponFulfillment<T>(promise: Promise<T>, onFulfilled: (value: T) => void | PromiseLike<void>): void {
  uponPromise(promise, onFulfilled);
}

export function uponRejection(promise: Promise<unknown>, onRejected: (reason: any) => void | PromiseLike<void>): void {
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
