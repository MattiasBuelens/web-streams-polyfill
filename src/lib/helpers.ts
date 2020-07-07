import assert from '../stub/assert';
import NumberIsNaN from '../stub/number-isnan';
import { FunctionPropertyNames, InferFirst, InferFunction, InferRest, Promisify } from '../util/type-utils';
import { promiseRejectedWith, promiseResolvedWith } from './helpers/webidl';

function IsPropertyKey(argument: any): argument is string | symbol {
  return typeof argument === 'string' || typeof argument === 'symbol';
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
