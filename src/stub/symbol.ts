const SymbolPolyfill: (description?: string) => symbol =
  typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ?
    Symbol :
    description => `Symbol(${description})` as any as symbol;

export default SymbolPolyfill;
