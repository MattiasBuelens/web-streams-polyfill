const { afterEach, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('require() package exports', () => {
  describe('main export', () => {
    testPonyfill('web-streams-polyfill', 'ponyfill.js');
  });
  describe('es5 export', () => {
    testPonyfill('web-streams-polyfill/es5', 'ponyfill.es5.js');
  });
  describe('polyfill export', () => {
    testPolyfill('web-streams-polyfill/polyfill', 'polyfill.js');
  });
  describe('polyfill/es5 export', () => {
    testPolyfill('web-streams-polyfill/polyfill/es5', 'polyfill.es5.js');
  });
});

function testPonyfill(id, expectedId) {
  let oldGlobalReadableStream;
  beforeEach(() => {
    oldGlobalReadableStream = global.ReadableStream;
  });
  afterEach(() => {
    global.ReadableStream = oldGlobalReadableStream;
  });
  it(`resolves to ${expectedId}`, () => {
    const resolved = require.resolve(id);
    assert.ok(resolved.endsWith(expectedId));
  });
  it('loads correctly', () => {
    const polyfill = requireUncached(id);
    assert.ok(polyfill.ReadableStream != null);
    assert.equal(global.ReadableStream, oldGlobalReadableStream);
  });
}

function testPolyfill(id, expectedId) {
  let oldGlobalReadableStream;
  beforeEach(() => {
    oldGlobalReadableStream = global.ReadableStream;
  });
  afterEach(() => {
    global.ReadableStream = oldGlobalReadableStream;
  });
  it(`resolves to ${expectedId}`, () => {
    const resolved = require.resolve(id);
    assert.ok(resolved.endsWith(expectedId));
  });
  it('loads correctly', () => {
    global.ReadableStream = undefined;
    requireUncached(id);
    assert.ok(global.ReadableStream != null);
  });
}

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(module);
}
