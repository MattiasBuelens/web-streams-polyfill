// Replaces the global stream classes with the subclasses of web-streams-polyfill/subclass,
// so the web platform tests run against those subclasses.

export const subclassNames = ['ReadableStream', 'ReadableStreamBYOBReader', 'WritableStream', 'TransformStream'];

export function installSubclassGlobals(global, exports) {
  for (const name of subclassNames) {
    if (Object.getPrototypeOf(exports[name].prototype) !== global[name].prototype) {
      throw new Error(`${name} is not a subclass of the native class`);
    }
  }
  for (const name of subclassNames) {
    global[name] = exports[name];
  }
}
