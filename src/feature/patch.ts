import { reflectCall } from '../lib/helpers/webidl';
import type { StreamClasses } from './types';

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
 * Makes `Class` take the place of `NativeClass`, sharing its prototype:
 * `Class` gets the native class's static members and prototype chain,
 * and the prototype's `constructor` points to `Class`.
 */
export function replaceConstructor(NativeClass: any, Class: any) {
  Object.setPrototypeOf(Class, Object.getPrototypeOf(NativeClass));
  for (const key of Reflect.ownKeys(NativeClass)) {
    if (key !== 'prototype' && key !== 'name' && key !== 'length') {
      Object.defineProperty(Class, key, Object.getOwnPropertyDescriptor(NativeClass, key)!);
    }
  }
  const prototype = NativeClass.prototype;
  Object.defineProperty(Class, 'prototype', { value: prototype, writable: false });
  Object.defineProperty(prototype, 'constructor', {
    ...Object.getOwnPropertyDescriptor(prototype, 'constructor'),
    value: Class
  });
}

/**
 * Finds a property descriptor on the prototype chain, e.g. when the classes are subclasses of the native ones.
 */
export function getPropertyDescriptor(object: any, key: string): PropertyDescriptor | undefined {
  while (object !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor !== undefined) {
      return descriptor;
    }
    object = Object.getPrototypeOf(object);
  }
  return undefined;
}

/**
 * Node.js defines an own `constructor` property on streams that it creates internally (e.g. the branches of `tee()`),
 * which still points to the native class after we replaced it.
 */
export function fixConstructor(stream: any, NativeClass: any, Class: any) {
  const descriptor = Object.getOwnPropertyDescriptor(stream, 'constructor');
  if (descriptor !== undefined && descriptor.configurable && descriptor.value !== Class
    && typeof descriptor.value === 'function' && descriptor.value.prototype === NativeClass.prototype) {
    Object.defineProperty(stream, 'constructor', { ...descriptor, value: Class });
  }
}

/**
 * Copies the given members of a dictionary into an object without a prototype, reading each member once.
 */
export function readMembers(dictionary: any, keys: string[]): any {
  const result = Object.create(null);
  for (const key of keys) {
    const value = dictionary?.[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Returns a copy of `members`, where the given methods are called with `original` as their `this` value.
 * Members that are not functions are copied as-is, so they still fail validation.
 */
export function bindMethods(members: any, original: any, keys: string[]): any {
  const result = Object.create(null);
  for (const key of Object.keys(members)) {
    const value = members[key];
    result[key] = keys.indexOf(key) !== -1 && typeof value === 'function'
      ? (...args: any[]) => reflectCall(value, original, args)
      : value;
  }
  return result;
}

/**
 * Defines a class on `classes`, keeping the attributes of the property it replaces (if any).
 */
export function defineClass(classes: StreamClasses, key: string, value: any) {
  const existing = Object.getOwnPropertyDescriptor(classes, key);
  Object.defineProperty(classes, key, {
    value,
    writable: existing?.writable ?? true,
    enumerable: existing?.enumerable ?? false,
    configurable: existing?.configurable ?? true
  });
}
