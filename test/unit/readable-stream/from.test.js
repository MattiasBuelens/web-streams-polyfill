const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReadableStream } = require('web-streams-polyfill');
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
    assert.ok(wrapped instanceof ReadableStream);
    const reader = wrapped.getReader();
    assert.deepEqual(await reader.read(), { done: false, value: 'a' });
    assert.deepEqual(await reader.read(), { done: false, value: 'b' });
    assert.deepEqual(await reader.read(), { done: true, value: undefined });
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
    assert.ok(wrapped instanceof ReadableStream);
    const reader = wrapped.getReader();
    assert.deepEqual(await reader.read(), { done: false, value: 1 });
    assert.deepEqual(await reader.read(), { done: false, value: 2 });
  });
});
