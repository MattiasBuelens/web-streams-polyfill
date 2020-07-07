export function isDictionary(x: any): x is object {
  return typeof x === 'object' || typeof x === 'function';
}

export function assertDictionary(obj: unknown, context = 'The provided value'): asserts obj is object | undefined {
  if (obj !== undefined && !isDictionary(obj)) {
    throw new TypeError(`${context} is not an object.`);
  }
}
