/// <reference types="node" />
import { globals } from '../globals';
import { setFunctionName } from '../lib/helpers/miscellaneous';

interface DOMException extends Error {
  name: string;
  message: string;
}

type DOMExceptionConstructor = new (message?: string, name?: string) => DOMException;

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
 * - Node 15 and higher (https://github.com/nodejs/node/commit/eee522ac29864a55a8bc6686e6b38e93270aa1ca)
 *
 * Original from node-domexception by Jimmy Wärting (license: MIT)
 * https://www.npmjs.com/package/node-domexception
 */
function getFromMessageChannel(): DOMExceptionConstructor | undefined {
  try {
    const port = new MessageChannel().port1;
    const buffer = new ArrayBuffer(0);
    port.postMessage(buffer, [buffer, buffer]);
    return undefined;
  } catch (err) {
    const ctor = (err as DOMException).constructor;
    return isDOMExceptionConstructor(ctor) ? ctor : undefined;
  }
}

/**
 * Support:
 * - All platforms
 */
function createPolyfill(): DOMExceptionConstructor {
  // eslint-disable-next-line no-shadow
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

// eslint-disable-next-line no-redeclare
const DOMException: DOMExceptionConstructor =
  getFromGlobal() ||
  getFromMessageChannel() ||
  createPolyfill();

export { DOMException };
