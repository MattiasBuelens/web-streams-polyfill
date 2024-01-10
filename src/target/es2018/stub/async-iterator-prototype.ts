/// <reference lib="es2018.asynciterable" />

/* eslint-disable @typescript-eslint/no-empty-function */
export const AsyncIteratorPrototype: AsyncIterable<any> =
  Object.getPrototypeOf(Object.getPrototypeOf(async function* (): AsyncIterableIterator<any> {}).prototype);
