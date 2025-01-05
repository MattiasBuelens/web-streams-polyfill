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
    expect(resolved.endsWith(expectedId)).toBeTrue();
  });
  it('loads correctly', () => {
    const polyfill = requireUncached(id);
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
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
    expect(resolved.endsWith(expectedId)).toBeTrue();
  });
  it('loads correctly', () => {
    global.ReadableStream = undefined;
    requireUncached(id);
    expect(global.ReadableStream).toBeDefined();
  });
}

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(module);
}
