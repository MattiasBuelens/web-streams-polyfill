import assert from '../stub/assert';
import NumberIsNaN from '../stub/number-isnan';
import { FunctionPropertyNames, InferFirst, InferFunction, InferRest, Promisify } from '../util/type-utils';
import { rethrowAssertionErrorRejection, typeIsObject } from './helpers/miscellaneous';

function IsPropertyKey(argument: any): argument is string | symbol {
  return typeof argument === 'string' || typeof argument === 'symbol';
}

export function isDictionary(x: any): x is object {
  return typeof x === 'object' || typeof x === 'function';
}

export function createDataProperty(o: object, p: string | symbol, v: any) {
  assert(typeIsObject(o));
  Object.defineProperty(o, p, { value: v, writable: true, enumerable: true, configurable: true });
}

export function createArrayFromList<T extends any[]>(elements: T): T {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice() as T;
}

export function ArrayBufferCopy(dest: ArrayBuffer, destOffset: number, src: ArrayBuffer, srcOffset: number, n: number) {
  new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
}

export function IsFiniteNonNegativeNumber(v: number): boolean {
  if (IsNonNegativeNumber(v) === false) {
    return false;
  }

  if (v === Infinity) {
    return false;
  }

  return true;
}

export function IsNonNegativeNumber(v: number): boolean {
  if (typeof v !== 'number') {
    return false;
  }

  if (NumberIsNaN(v)) {
    return false;
  }

  if (v < 0) {
    return false;
  }

  return true;
}

export function Call<T, A extends any[], R>(F: (this: T, ...args: A) => R, V: T, args: A): R {
  if (typeof F !== 'function') {
    throw new TypeError('Argument is not a function');
  }

  return Function.prototype.apply.call(F, V, args);
}

export function CreateAlgorithmFromUnderlyingMethod<T,
  Key extends FunctionPropertyNames<Required<T>> = FunctionPropertyNames<Required<T>>>(
  underlyingObject: T,
  methodName: Key,
  algoArgCount: 0,
  extraArgs: Parameters<InferFunction<T[Key]>>): () => Promisify<ReturnType<InferFunction<T[Key]>>>;
export function CreateAlgorithmFromUnderlyingMethod<T,
  Key extends FunctionPropertyNames<Required<T>> = FunctionPropertyNames<Required<T>>>(
  underlyingObject: T,
  methodName: Key,
  algoArgCount: 1,
  extraArgs: InferRest<Parameters<InferFunction<T[Key]>>>): (arg: InferFirst<Parameters<InferFunction<T[Key]>>>) => Promisify<ReturnType<InferFunction<T[Key]>>>;
export function CreateAlgorithmFromUnderlyingMethod(underlyingObject: any,
                                                    methodName: any,
                                                    algoArgCount: 0 | 1,
                                                    extraArgs: any[]): (...args: any[]) => any {
  assert(underlyingObject !== undefined);
  assert(IsPropertyKey(methodName));
  assert(algoArgCount === 0 || algoArgCount === 1);
  assert(Array.isArray(extraArgs));
  const method = underlyingObject[methodName];
  if (method !== undefined) {
    if (typeof method !== 'function') {
      throw new TypeError(`${method} is not a method`);
    }
    switch (algoArgCount) {
      case 0: {
        return () => {
          return PromiseCall(method, underlyingObject, extraArgs);
        };
      }

      case 1: {
        return arg => {
          const fullArgs = [arg].concat(extraArgs);
          return PromiseCall(method, underlyingObject, fullArgs);
        };
      }
    }
  }
  return () => promiseResolvedWith(undefined);
}

export function InvokeOrNoop<T, Key extends FunctionPropertyNames<Required<T>> = FunctionPropertyNames<Required<T>>>(
  O: T,
  P: Key,
  args: Parameters<InferFunction<T[Key]>>): ReturnType<InferFunction<T[Key]>> | undefined {
  assert(O !== undefined);
  assert(IsPropertyKey(P));
  assert(Array.isArray(args));

  const method = O[P] as InferFunction<T[Key]> | undefined;
  if (method === undefined) {
    return undefined;
  }

  return Call(method, O, args);
}

export function PromiseCall<T, A extends any[], R>(F: (this: T, ...args: A) => R | PromiseLike<R>,
                                                   V: T,
                                                   args: A): Promise<R> {
  assert(typeof F === 'function');
  assert(V !== undefined);
  assert(Array.isArray(args));
  try {
    return promiseResolvedWith(Call(F, V, args));
  } catch (value) {
    return promiseRejectedWith(value);
  }
}

// Not implemented correctly
export function TransferArrayBuffer<T extends ArrayBufferLike>(O: T): T {
  return O;
}

// Not implemented correctly
export function IsDetachedBuffer(O: ArrayBufferLike): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  return false;
}

export function ValidateAndNormalizeHighWaterMark(highWaterMark: number): number {
  highWaterMark = Number(highWaterMark);
  if (NumberIsNaN(highWaterMark) || highWaterMark < 0) {
    throw new RangeError('highWaterMark property of a queuing strategy must be non-negative and non-NaN');
  }

  return highWaterMark;
}

export function MakeSizeAlgorithmFromSizeFunction<T>(size?: (chunk: T) => number): (chunk: T) => number {
  if (size === undefined) {
    return () => 1;
  }
  if (typeof size !== 'function') {
    throw new TypeError('size property of a queuing strategy must be a function');
  }
  return chunk => size(chunk);
}

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
