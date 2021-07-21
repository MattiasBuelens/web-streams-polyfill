/// <reference lib="dom" />

function getGlobals() {
  if (typeof self !== 'undefined') {
    return self;
  } else if (typeof window !== 'undefined') {
    return window;
  } else if (typeof global !== 'undefined') {
    return global;
  }
  return undefined;
}

export const globals = getGlobals();
