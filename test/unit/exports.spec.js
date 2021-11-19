describe('package exports', () => {
  let oldGlobalReadableStream;
  beforeEach(() => {
    oldGlobalReadableStream = global.ReadableStream;
  });
  afterEach(() => {
    global.ReadableStream = oldGlobalReadableStream;
  });
  it('main export works', () => {
    const polyfill = requireUncached('web-streams-polyfill');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('es5 export works', () => {
    const polyfill = requireUncached('web-streams-polyfill/es5');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('polyfill export works', () => {
    global.ReadableStream = undefined;
    requireUncached('web-streams-polyfill/polyfill');
    expect(global.ReadableStream).toBeDefined();
  });
  it('polyfill/es5 export works', () => {
    global.ReadableStream = undefined;
    requireUncached('web-streams-polyfill/polyfill/es5');
    expect(global.ReadableStream).toBeDefined();
  });
});

describe('fallback package exports', () => {
  let oldGlobalReadableStream;
  beforeEach(() => {
    oldGlobalReadableStream = global.ReadableStream;
  });
  afterEach(() => {
    global.ReadableStream = oldGlobalReadableStream;
  });
  it('main export works', () => {
    const polyfill = requireUncached('../../');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('es5 export works', () => {
    const polyfill = requireUncached('../../es5');
    expect(polyfill.ReadableStream).toBeDefined();
    expect(global.ReadableStream).toBe(oldGlobalReadableStream);
  });
  it('polyfill export works', () => {
    global.ReadableStream = undefined;
    requireUncached('../../polyfill');
    expect(global.ReadableStream).toBeDefined();
  });
  it('polyfill/es5 export works', () => {
    global.ReadableStream = undefined;
    requireUncached('../../polyfill/es5');
    expect(global.ReadableStream).toBeDefined();
  });
});

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  // eslint-disable-next-line global-require
  return require(module);
}
