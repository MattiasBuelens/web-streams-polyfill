/// <reference lib="dom" />
export let NativeDOMException: typeof DOMException | undefined = typeof DOMException !== 'undefined' ? DOMException : undefined;
