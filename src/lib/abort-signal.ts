/**
 * A signal object that allows you to communicate with a request and abort it if required
 * via its associated `AbortController` object.
 *
 * @remarks
 *   This is equivalent to the `AbortSignal` interface defined in TypeScript's DOM types or `@types/node`.
 *
 * @public
 */
export type AbortSignal = typeof globalThis extends { AbortSignal: { prototype: infer T } } ? T : never;

export function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  try {
    return typeof (value as AbortSignal).aborted === 'boolean';
  } catch {
    // AbortSignal.prototype.aborted throws if its brand check fails
    return false;
  }
}

/**
 * A controller object that allows you to abort an `AbortSignal` when desired.
 *
 * @remarks
 *   This is equivalent to the `AbortController` interface defined in TypeScript's DOM types or `@types/node`.
 *
 * @internal
 */
// Trick with globalThis inspired by @types/node
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0c370ead967cb97b1758d8fa15d09011fb3f58ea/types/node/globals.d.ts#L226
export type AbortController = typeof globalThis extends { AbortController: { prototype: infer T } } ? T : never;

/**
 * Construct a new AbortController, if supported by the platform.
 *
 * @internal
 */
export function createAbortController(): AbortController | undefined {
  if (typeof AbortController === 'function') {
    return new AbortController();
  }
  return undefined;
}
