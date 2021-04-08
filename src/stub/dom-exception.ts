/// <reference types="node" />
import { NativeDOMException } from './native';

declare class DOMExceptionClass extends Error {
  constructor(message?: string, name?: string);

  name: string;
  message: string;
}

type DOMException = DOMExceptionClass;
type DOMExceptionConstructor = typeof DOMExceptionClass;

function isDOMExceptionConstructor(ctor: unknown): ctor is DOMExceptionConstructor {
  if (!(typeof ctor === 'function' || typeof ctor === 'object')) {
    return false;
  }
  try {
    new (ctor as DOMExceptionConstructor)();
    return true;
  } catch {
    return false;
  }
}

function createDOMExceptionPolyfill(): DOMExceptionConstructor {
  // eslint-disable-next-line no-shadow
  const ctor = function DOMException(this: DOMException, message?: string, name?: string) {
    this.message = message || '';
    this.name = name || 'Error';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  } as any;
  ctor.prototype = Object.create(Error.prototype);
  Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, configurable: true });
  return ctor;
}

// eslint-disable-next-line no-redeclare
const DOMException: DOMExceptionConstructor =
  isDOMExceptionConstructor(NativeDOMException) ? NativeDOMException : createDOMExceptionPolyfill();

export { DOMException };
