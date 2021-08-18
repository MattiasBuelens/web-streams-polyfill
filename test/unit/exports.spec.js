/* eslint-disable global-require */

describe('package exports', () => {
  let oldGlobalReadableStream;
  beforeEach(() => {
    oldGlobalReadableStream = global.ReadableStream;
  });
  afterEach(() => {
    global.ReadableStream = oldGlobalReadableStream;
  });
  it('main export works', () => {
    global.ReadableStream = undefined;
    require('web-streams-polyfill');
    expect(global.ReadableStream).toBeDefined();
  });
  it('es5 export works', () => {
    global.ReadableStream = undefined;
    require('web-streams-polyfill/es5');
    expect(global.ReadableStream).toBeDefined();
  });
  it('ponyfill export works', () => {
    const polyfill = require('web-streams-polyfill/ponyfill');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('ponyfill/es5 export works', () => {
    const polyfill = require('web-streams-polyfill/ponyfill/es5');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
});
