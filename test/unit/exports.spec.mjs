describe('import() package exports', () => {
  it('main export works', async () => {
    const resolved = await import.meta.resolve('web-streams-polyfill');
    expect(resolved).toMatch(/ponyfill\.mjs$/);
  });
  it('es5 export works', async () => {
    const resolved = await import.meta.resolve('web-streams-polyfill/es5');
    expect(resolved).toMatch(/ponyfill\.es5\.mjs$/);
  });
  it('polyfill export works', async () => {
    const resolved = await import.meta.resolve('web-streams-polyfill/polyfill');
    expect(resolved).toMatch(/polyfill\.js$/);
  });
  it('polyfill/es5 export works', async () => {
    const resolved = await import.meta.resolve('web-streams-polyfill/polyfill/es5');
    expect(resolved).toMatch(/polyfill\.es5\.js$/);
  });
});
