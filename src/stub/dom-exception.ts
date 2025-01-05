import { globals } from '../globals';
import { setFunctionName } from '../lib/helpers/miscellaneous';

declare global {
  interface ErrorConstructor {
    // From @types/node
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
  }
}

interface DOMException extends Error {
  name: string;
  message: string;
}

type DOMExceptionConstructor = new (message?: string, name?: string) => DOMException;

function isDOMExceptionConstructor(ctor: unknown): ctor is DOMExceptionConstructor {
  if (!(typeof ctor === 'function' || typeof ctor === 'object')) {
    return false;
  }
  if ((ctor as DOMExceptionConstructor).name !== 'DOMException') {
    return false;
  }
  try {
    new (ctor as DOMExceptionConstructor)();
    return true;
  } catch {
    return false;
  }
}

/**
 * Support:
 * - Web browsers
 * - Node 18 and higher (https://github.com/nodejs/node/commit/e4b1fb5e6422c1ff151234bb9de792d45dd88d87)
 */
function getFromGlobal(): DOMExceptionConstructor | undefined {
  const ctor = globals?.DOMException;
  return isDOMExceptionConstructor(ctor) ? ctor : undefined;
}

/**
 * Support:
 * - All platforms
 */
function createPolyfill(): DOMExceptionConstructor {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const ctor = function DOMException(this: DOMException, message?: string, name?: string) {
    this.message = message || '';
    this.name = name || 'Error';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  } as any;
  setFunctionName(ctor, 'DOMException');
  ctor.prototype = Object.create(Error.prototype);
  Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, configurable: true });
  return ctor;
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
const DOMException: DOMExceptionConstructor = getFromGlobal() || createPolyfill();

export { DOMException };
