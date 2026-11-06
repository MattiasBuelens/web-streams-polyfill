import { reflectCall } from '../lib/helpers/webidl';

/**
 * Replaces a getter on a native prototype with one that handles our own objects,
 * and falls back to the native getter for native objects.
 */
export function patchGetter(prototype: any, key: string, source: object, isOwn: (x: any) => boolean) {
  const nativeDescriptor = getPropertyDescriptor(prototype, key)!;
  const nativeGetter = nativeDescriptor.get!;
  const ownGetter = Object.getOwnPropertyDescriptor(source, key)!.get!;
  const getter = Object.getOwnPropertyDescriptor({
    get [key]() {
      if (isOwn(this)) {
        return reflectCall(ownGetter, this, []);
      }
      return reflectCall(nativeGetter, this, []);
    }
  }, key)!.get;
  Object.defineProperty(prototype, key, { ...nativeDescriptor, get: getter });
}

/**
 * Replaces a method on a native prototype with one that handles our own objects,
 * and falls back to the native method for native objects.
 */
export function patchMethod(prototype: any, key: string, source: Record<string, (...args: any[]) => any>, isOwn: (x: any) => boolean) {
  const nativeDescriptor = getPropertyDescriptor(prototype, key)!;
  const nativeMethod = nativeDescriptor.value;
  const ownMethod = source[key];
  const { [key]: method } = {
    [key](this: any, ...args: any[]) {
      if (isOwn(this)) {
        return reflectCall(ownMethod, this, args);
      }
      return reflectCall(nativeMethod, this, args);
    }
  };
  Object.defineProperty(prototype, key, { ...nativeDescriptor, value: method });
}

/**
 * Replaces a method on a native prototype, keeping the attributes of the native property.
 * Returns the native method.
 */
export function replaceMethod(prototype: any, key: string, method: (...args: any[]) => any): (...args: any[]) => any {
  const nativeDescriptor = getPropertyDescriptor(prototype, key)!;
  Object.defineProperty(prototype, key, { ...nativeDescriptor, value: method });
  return nativeDescriptor.value;
}

/**
 * Finds a property descriptor on the prototype chain, e.g. when the classes are subclasses of the native ones.
 */
function getPropertyDescriptor(object: any, key: string): PropertyDescriptor | undefined {
  while (object !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor !== undefined) {
      return descriptor;
    }
    object = Object.getPrototypeOf(object);
  }
  return undefined;
}
