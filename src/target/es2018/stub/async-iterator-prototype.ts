/// <reference lib="es2018.asynciterable" />

export const AsyncIteratorPrototype: AsyncIterable<any> | undefined =
  Object.getPrototypeOf(Object.getPrototypeOf(async function* (): AsyncIterableIterator<any> {}).prototype);
