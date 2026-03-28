const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReadableStream, WritableStream } = require('web-streams-polyfill');

describe('ReadableStream.pipeTo', () => {
  // https://github.com/nodejs/node/commit/199daab0b0822d6063a73b9362bfce8667d2a112
  describe('with prefilled buffer', () => {
    const n = 1e5;

    async function test(bufferSize) {
      let enqueued = 0;

      const rs = new ReadableStream({
        start(controller) {
          // Pre-fill the buffer
          for (let i = 0; i < bufferSize; i++) {
            controller.enqueue('a');
            enqueued++;
          }
        },
        pull(controller) {
          // Refill buffer when pulled
          const toEnqueue = Math.min(bufferSize, n - enqueued);
          for (let i = 0; i < toEnqueue; i++) {
            controller.enqueue('a');
            enqueued++;
          }
          if (enqueued >= n) {
            controller.close();
          }
        }
      }, {
        // Use buffer size as high water mark to allow pre-buffering
        highWaterMark: bufferSize
      });

      let writes = 0;
      const ws = new WritableStream({
        write(_chunk) {
          writes++;
        }
      });

      await rs.pipeTo(ws);
      assert.equal(writes, n);
    }

    for (const bufferSize of [1, 10, 100, 1000]) {
      it(`of size ${bufferSize}`, () => test(bufferSize));
    }
  });
});
