/// <reference lib="dom" />

declare global {
  // From @types/node
  // eslint-disable-next-line no-var
  var global: typeof globalThis;
}

function getGlobals(): typeof globalThis | undefined {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  } else if (typeof self !== 'undefined') {
    return self;
  } else if (typeof global !== 'undefined') {
    return global;
  }
  return undefined;
}

export const globals = getGlobals();
