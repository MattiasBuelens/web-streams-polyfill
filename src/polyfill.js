import * as interfaces from './ponyfill';
import { globals } from './utils';

// Export
export * from './ponyfill';

// Add classes to global scope
if (typeof globals !== 'undefined') {
  Object.assign(globals, interfaces);
}
