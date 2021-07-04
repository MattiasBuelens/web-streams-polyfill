/// <reference lib="dom" />
export const NativeDOMException: typeof DOMException | undefined =
  typeof DOMException !== 'undefined' ? DOMException : undefined;
