import { globals } from '../globals.ts';

// This module is only used by the ES5 builds, which replace every `Symbol` reference with it.
// - Look up Symbol through the global object, so the build has no direct references to the global `Symbol`.
// - Don't use `typeof x === 'symbol'`: this module is added after the main ES5 transform,
//   and lowering that check would need a helper that references the global `Symbol` again.
const NativeSymbol: SymbolConstructor | undefined = globals?.Symbol;

const SymbolPolyfill: (description?: string) => symbol
  = typeof NativeSymbol === 'function'
    && Object.prototype.toString.call(NativeSymbol.iterator) === '[object Symbol]'
    ? NativeSymbol
    : description => `Symbol(${description})` as any as symbol;

export default SymbolPolyfill;
