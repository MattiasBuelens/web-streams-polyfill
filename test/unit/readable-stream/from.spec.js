const { ReadableStream } = require('web-streams-polyfill/ponyfill');
const { ReadableStream: NodeReadableStream } = require('node:stream/web');

describe('ReadableStream.from()', () => {
  it('supports a Node.js ReadableStream', async () => {
    const native = new NodeReadableStream({
      start(c) {
        c.enqueue('a');
        c.enqueue('b');
        c.close();
      }
    });
    const wrapped = ReadableStream.from(native);
    expect(wrapped instanceof ReadableStream).toBe(true);
    const reader = wrapped.getReader();
    await expectAsync(reader.read()).toBeResolvedTo({ done: false, value: 'a' });
    await expectAsync(reader.read()).toBeResolvedTo({ done: false, value: 'b' });
    await expectAsync(reader.read()).toBeResolvedTo({ done: true, value: undefined });
  });

  it('supports a ReadableStream-like object', async () => {
    let i = 0;
    const closedPromise = new Promise(() => {});
    const readerLike = {
      get closed() { return closedPromise; },
      async read() { return { done: false, value: ++i }; },
      async cancel() {},
      releaseLock() {}
    };
    const streamLike = {
      getReader() { return readerLike; }
    };
    const wrapped = ReadableStream.from(streamLike);
    expect(wrapped instanceof ReadableStream).toBe(true);
    const reader = wrapped.getReader();
    await expectAsync(reader.read()).toBeResolvedTo({ done: false, value: 1 });
    await expectAsync(reader.read()).toBeResolvedTo({ done: false, value: 2 });
  });
});
