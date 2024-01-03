/// <reference lib="dom" />

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
