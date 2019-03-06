export const AsyncIteratorPrototype: AsyncIterator<any> | undefined =
  Object.getPrototypeOf(Object.getPrototypeOf(async function* (): AsyncIterableIterator<any> {}).prototype);
