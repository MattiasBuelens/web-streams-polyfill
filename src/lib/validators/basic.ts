import NumberIsFinite from '../../stub/number-isfinite';
import MathTrunc from '../../stub/math-trunc';

// https://heycam.github.io/webidl/#idl-dictionaries
export function isDictionary(x: any): x is object | null {
  return typeof x === 'object' || typeof x === 'function';
}

export function assertDictionary(obj: unknown,
                                 context: string): asserts obj is object | null | undefined {
  if (obj !== undefined && !isDictionary(obj)) {
    throw new TypeError(`${context} is not an object.`);
  }
}

export type AnyFunction = (...args: any[]) => any;

// https://heycam.github.io/webidl/#idl-callback-functions
export function assertFunction(x: unknown, context: string): asserts x is AnyFunction {
  if (typeof x !== 'function') {
    throw new TypeError(`${context} is not a function.`);
  }
}

// https://heycam.github.io/webidl/#idl-object
export function isObject(x: any): x is object {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
}

export function assertObject(x: unknown,
                             context: string): asserts x is object {
  if (!isObject(x)) {
    throw new TypeError(`${context} is not an object.`);
  }
}

export function assertRequiredArgument<T extends any>(x: T | undefined,
                                                      position: number,
                                                      context: string): asserts x is T {
  if (x === undefined) {
    throw new TypeError(`Parameter ${position} is required in '${context}'.`);
  }
}

export function assertRequiredField<T extends any>(x: T | undefined,
                                                   field: string,
                                                   context: string): asserts x is T {
  if (x === undefined) {
    throw new TypeError(`${field} is required in '${context}'.`);
  }
}

// https://heycam.github.io/webidl/#idl-unrestricted-double
export function convertUnrestrictedDouble(value: unknown): number {
  return Number(value);
}

function censorNegativeZero(x: number): number {
  return x === 0 ? 0 : x;
}

function integerPart(x: number): number {
  return censorNegativeZero(MathTrunc(x));
}

// https://heycam.github.io/webidl/#idl-unsigned-long-long
export function convertUnsignedLongLongWithEnforceRange(value: unknown, context: string): number {
  const lowerBound = 0;
  const upperBound = Number.MAX_SAFE_INTEGER;

  let x = Number(value);
  x = censorNegativeZero(x);

  if (!NumberIsFinite(x)) {
    throw new TypeError(`${context} is not a finite number`);
  }

  x = integerPart(x);

  if (x < lowerBound || x > upperBound) {
    throw new TypeError(`${context} is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`);
  }

  if (!NumberIsFinite(x) || x === 0) {
    return 0;
  }

  // TODO Use BigInt if supported?
  // let xBigInt = BigInt(integerPart(x));
  // xBigInt = BigInt.asUintN(64, xBigInt);
  // return Number(xBigInt);

  return x;
}
