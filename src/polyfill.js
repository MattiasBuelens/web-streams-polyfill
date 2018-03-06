import * as interfaces from './ponyfill';
import { getGlobals } from './utils';

// Export
export * from './ponyfill';

// Add classes to global scope
const globals = getGlobals();
if (typeof globals !== 'undefined') {
  Object.assign(globals, interfaces);
}
