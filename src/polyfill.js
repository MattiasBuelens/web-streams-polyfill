/* global window */
import * as interfaces from './ponyfill';

// Export
export * from './ponyfill';

// Add classes to window
if (typeof window !== 'undefined') {
  Object.assign(window, interfaces);
}
