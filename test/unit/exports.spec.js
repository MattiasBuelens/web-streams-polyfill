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
    const polyfill = require('web-streams-polyfill');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('es5 export works', () => {
    const polyfill = require('web-streams-polyfill/es5');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('polyfill export works', () => {
    global.ReadableStream = undefined;
    require('web-streams-polyfill/polyfill');
    expect(global.ReadableStream).toBeDefined();
  });
  it('polyfill/es5 export works', () => {
    global.ReadableStream = undefined;
    require('web-streams-polyfill/polyfill/es5');
    expect(global.ReadableStream).toBeDefined();
  });
});
