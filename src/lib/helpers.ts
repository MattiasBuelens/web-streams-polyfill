import assert from '../stub/better-assert';
import NumberIsNaN from '../stub/number-isnan';
import { FunctionPropertyNames, InferFirst, InferFunction, InferRest } from '../util/type-utils';

function IsPropertyKey(argument: any): argument is string | symbol {
  return typeof argument === 'string' || typeof argument === 'symbol';
}

export function typeIsObject(x: any): x is object {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
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
  Key extends FunctionPropertyNames<T>,
  Fn extends InferFunction<T[Key]>,
  Args extends Parameters<Fn>>(underlyingObject: T,
  methodName: Key,
  algoArgCount: 0,
  extraArgs: Args): () => ReturnType<Fn>;
export function CreateAlgorithmFromUnderlyingMethod<T,
  Key extends FunctionPropertyNames<T>,
  Fn extends InferFunction<T[Key]>,
  Args extends Parameters<Fn>>(underlyingObject: T,
  methodName: Key,
  algoArgCount: 1,
  extraArgs: InferRest<Args>): (arg: InferFirst<Args>) => ReturnType<Fn>;
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
  return () => Promise.resolve();
}

export function InvokeOrNoop<T,
  Key extends FunctionPropertyNames<T>,
  Fn extends InferFunction<T[Key]>>(O: T, P: Key, args: Parameters<Fn>): ReturnType<Fn> | undefined {
  assert(O !== undefined);
  assert(IsPropertyKey(P));
  assert(Array.isArray(args));

  const method = O[P] as Fn | undefined; // TODO Fix type?
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
    return Promise.resolve(Call(F, V, args));
  } catch (value) {
    return Promise.reject(value);
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

export function PerformPromiseThen<T>(promise: Promise<T>,
                                      onFulfilled: (result: T) => any,
                                      onRejected: (reason: any) => any) {
  // There doesn't appear to be any way to correctly emulate the behaviour from JavaScript, so this is just an
  // approximation.
  return Promise.prototype.then.call(promise, onFulfilled, onRejected);
}

export function WaitForAll<T>(promises: Array<Promise<T>>,
                              successSteps: (results: T[]) => void,
                              failureSteps: (reason: any) => void) {
  let rejected = false;
  const rejectionHandler = (arg: any) => {
    if (rejected === false) {
      rejected = true;
      failureSteps(arg);
    }
  };
  let index = 0;
  let fulfilledCount = 0;
  const total = promises.length;
  const result = new Array<T>(total);
  for (const promise of promises) {
    const promiseIndex = index;
    const fulfillmentHandler = (arg: T) => {
      result[promiseIndex] = arg;
      ++fulfilledCount;
      if (fulfilledCount === total) {
        successSteps(result);
      }
    };
    PerformPromiseThen(promise, fulfillmentHandler, rejectionHandler);
    ++index;
  }
}

export function WaitForAllPromise<T, R>(promises: Array<Promise<T>>,
                                        successSteps: (results: T[]) => R,
                                        failureSteps: ((reason: any) => R) | undefined = undefined): Promise<R> {
  let resolvePromise: (result: R) => void;
  let rejectPromise: (reason: any) => void;
  const promise = new Promise<R>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  if (failureSteps === undefined) {
    failureSteps = arg => {
      throw arg;
    };
  }
  const successStepsWrapper = (results: T[]) => {
    try {
      const stepsResult = successSteps(results);
      resolvePromise(stepsResult);
    } catch (e) {
      rejectPromise(e);
    }
  };
  const failureStepsWrapper = (reason: any) => {
    try {
      const stepsResult = failureSteps!(reason);
      resolvePromise(stepsResult);
    } catch (e) {
      rejectPromise(e);
    }
  };
  WaitForAll(promises, successStepsWrapper, failureStepsWrapper);
  return promise;
}
