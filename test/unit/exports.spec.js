/* eslint-disable global-require */

describe('package exports', () => {
  it('main export works', () => {
    const polyfill = require('web-streams-polyfill');
    expect(polyfill.ReadableStream).toBeDefined();
  });
  it('es5 export works', () => {
    const polyfill = require('web-streams-polyfill/es5');
    expect(polyfill.ReadableStream).toBeDefined();
  });
  it('ponyfill export works', () => {
    const polyfill = require('web-streams-polyfill/ponyfill');
    expect(polyfill.ReadableStream).toBeDefined();
  });
  it('ponyfill/es5 export works', () => {
    const polyfill = require('web-streams-polyfill/ponyfill/es5');
    expect(polyfill.ReadableStream).toBeDefined();
  });
});
