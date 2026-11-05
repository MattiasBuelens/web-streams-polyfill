/**
 * The stream classes that a feature checks or installs.
 * Defaults to `globalThis`, but this can also be any object holding (subclasses of) the native classes.
 *
 * @public
 */
export interface StreamClasses {
  ReadableStream?: any;
  WritableStream?: any;
  TransformStream?: any;
  /**
   * Installed by the `readable-byte-streams` feature.
   */
  ReadableByteStreamController?: any;
  ReadableStreamBYOBReader?: any;
  ReadableStreamDefaultReader?: any;
  ReadableStreamBYOBRequest?: any;
  /**
   * The prototype of this class is patched instead of the prototype of the native controller,
   * if a feature needs to patch the controller (e.g. `transformer-cancel`).
   * Defaults to the class of the controller that `TransformStream` passes to its transformer.
   */
  TransformStreamDefaultController?: any;
}

export function getGlobals(): StreamClasses {
  return globalThis as StreamClasses;
}

/**
 * Defines a method on `target` like WebIDL does for operations: writable, configurable,
 * and enumerable unless it's keyed by a symbol.
 */
export function defineMethod(target: object, key: PropertyKey, method: (...args: any[]) => any): void {
  Object.defineProperty(target, key, {
    value: method,
    writable: true,
    enumerable: typeof key !== 'symbol',
    configurable: true
  });
}
