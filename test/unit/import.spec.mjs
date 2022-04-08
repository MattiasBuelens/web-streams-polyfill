describe('import() package exports', () => {
  it('main export', async () => {
    await testResolve('web-streams-polyfill', 'ponyfill.mjs');
  });
  it('es5 export', async () => {
    await testResolve('web-streams-polyfill/es5', 'ponyfill.es5.mjs');
  });
  it('polyfill export', async () => {
    await testResolve('web-streams-polyfill/polyfill', 'polyfill.js');
  });
  it('polyfill/es5 export', async () => {
    await testResolve('web-streams-polyfill/polyfill/es5', 'polyfill.es5.js');
  });
});

async function testResolve(id, expectedId) {
  const resolved = await import.meta.resolve(id);
  expect(resolved.endsWith(expectedId)).toBeTrue();
}
