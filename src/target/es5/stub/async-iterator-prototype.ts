/// <reference lib="es2018.asynciterable" />

import { SymbolAsyncIterator } from '../../../lib/abstract-ops/ecmascript';

// We cannot access %AsyncIteratorPrototype% without non-ES2018 syntax, but we can re-create it.
export const AsyncIteratorPrototype: AsyncIterable<any> = {
  // 25.1.3.1 %AsyncIteratorPrototype% [ @@asyncIterator ] ( )
  // https://tc39.github.io/ecma262/#sec-asynciteratorprototype-asynciterator
  [SymbolAsyncIterator](this: AsyncIterator<any>) {
    return this;
  }
};
Object.defineProperty(AsyncIteratorPrototype, SymbolAsyncIterator, { enumerable: false });
