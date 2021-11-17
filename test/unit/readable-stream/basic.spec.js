require('abort-controller/polyfill');
const { ReadableStream, WritableStream } = require('web-streams-polyfill');
const { AbortController } = require('abort-controller');

describe('ReadableStream', () => {
  describe('constructor', () => {
    it('constructs with no arguments', () => {
      const rs = new ReadableStream();
      expect(rs instanceof ReadableStream).toBe(true);
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
      expect(await reader.read()).toEqual({ done: false, value: 'a' });
      expect(await reader.read()).toEqual({ done: false, value: 'b' });
      expect(await reader.read()).toEqual({ done: true, value: undefined });
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
      const controller = new AbortController();
      await rs.pipeTo(ws, { signal: controller.signal });
    });
    it('rejects with an AbortError when aborted', async () => {
      const rs = new ReadableStream({
        start(c) {
          c.enqueue('a');
          c.close();
        }
      });
      const ws = new WritableStream();
      const controller = new AbortController();
      controller.abort();
      try {
        await rs.pipeTo(ws, { signal: controller.signal });
        fail('should have rejected');
      } catch (e) {
        expect(e.name).toBe('AbortError');
      }
    });
  });
});
