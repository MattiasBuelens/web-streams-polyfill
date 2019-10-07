/// <reference lib="dom" />

export function isAbortSignal(value: any): value is AbortSignal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Use the brand check to distinguish a real AbortSignal from a fake one.
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
  try {
    aborted.call(value);
    return true;
  } catch (e) {
    return false;
  }
}
