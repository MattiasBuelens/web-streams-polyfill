export function isDictionary(x: any): x is object {
  return typeof x === 'object' || typeof x === 'function';
}

export function assertDictionary(obj: unknown, context = 'The provided value'): asserts obj is object | undefined {
  if (obj !== undefined && !isDictionary(obj)) {
    throw new TypeError(`${context} is not an object.`);
  }
}

export type AnyFunction = (...args: any[]) => any;

export function assertFunction(x: unknown, context = 'The provided value'): asserts x is AnyFunction {
  if (typeof x !== 'function') {
    throw new TypeError(`${context} is not a function.`);
  }
}

export function assertRequiredArgument<T extends any>(x: T | undefined,
                                                      position: number,
                                                      context: string): asserts x is T {
  if (x === undefined) {
    throw new TypeError(`Parameter ${position} is required in '${context}.`);
  }
}

export function assertRequiredField<T extends any>(x: T | undefined,
                                                   field: string,
                                                   context: string): asserts x is T {
  if (x === undefined) {
    throw new TypeError(`${field} is required in '${context}'.`);
  }
}

export function convertUnrestrictedDouble(value: unknown): number {
  return Number(value);
}
