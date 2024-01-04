describe('import() package exports', () => {
  describe('main export', () => {
    testPonyfill('web-streams-polyfill', 'ponyfill.mjs');
  });
  describe('es5 export', () => {
    testPonyfill('web-streams-polyfill/es5', 'ponyfill.es5.mjs');
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
  it(`resolves to ${expectedId}`, async () => {
    await testResolve(id, expectedId);
  });
  it('loads correctly', async () => {
    const polyfill = await import(id);
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
  it(`resolves to ${expectedId}`, async () => {
    await testResolve(id, expectedId);
  });
  // FIXME Remove from import() cache first somehow?
  // it('loads correctly', async () => {
  //   global.ReadableStream = undefined;
  //   await import(id);
  //   expect(global.ReadableStream).toBeDefined();
  // });
}

async function testResolve(id, expectedId) {
  const resolved = (await import.meta.resolve(id)).toString();
  expect(resolved.endsWith(expectedId)).toBeTrue();
}
