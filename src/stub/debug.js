import { noop } from '../utils';

function createDebugMessage(namespace, message) {
  return `[${namespace}] ${message}`;
}

export default function debug(namespace) {
  /* eslint-disable no-console */
  if (typeof console !== 'undefined') {
    if (typeof console.debug === 'function') {
      return message => console.debug(createDebugMessage(namespace, message));
    }
    if (typeof console.log === 'function') {
      return message => console.log(createDebugMessage(namespace, message));
    }
  }
  return noop;
}
