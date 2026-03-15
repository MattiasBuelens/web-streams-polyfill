const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReadableStream, WritableStream } = require('web-streams-polyfill');
const { FakeAbortSignal } = require('../util/fake-abort-signal');

describe('ReadableStream', () => {
  describe('constructor', () => {
    it('constructs with no arguments', () => {
      const rs = new ReadableStream();
      assert.ok(rs instanceof ReadableStream);
    });
  });

  describe('getReader', () => {
    it('reads chunks from underlying source', async () => {
      const rs = new ReadableStream({
        start(c) {
          c.enqueue('a');
          c.enqueue('b');
          c.close();
        }
      });
      const reader = rs.getReader();
      assert.deepEqual(await reader.read(), { done: false, value: 'a' });
      assert.deepEqual(await reader.read(), { done: false, value: 'b' });
      assert.deepEqual(await reader.read(), { done: true, value: undefined });
    });
  });

  describe('pipeTo', () => {
    it('accepts an abort signal', async () => {
      const rs = new ReadableStream({
        start(c) {
          c.enqueue('a');
          c.close();
        }
      });
      const ws = new WritableStream();
      const signal = new FakeAbortSignal(false);
      await rs.pipeTo(ws, { signal });
    });
    it('rejects with an AbortError when aborted', async () => {
      const rs = new ReadableStream({
        start(c) {
          c.enqueue('a');
          c.close();
        }
      });
      const ws = new WritableStream();
      const signal = new FakeAbortSignal(true);
      await assert.rejects(rs.pipeTo(ws, { signal }), { name: 'AbortError' });
    });
  });
});
