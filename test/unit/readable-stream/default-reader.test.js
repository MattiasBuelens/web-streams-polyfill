const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReadableStream } = require('web-streams-polyfill');

describe('ReadableStreamDefaultReader', () => {
  // https://github.com/nodejs/node/commit/199daab0b0822d6063a73b9362bfce8667d2a112
  describe('read() with prefilled buffer', () => {
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

      const reader = rs.getReader();
      let x;
      let reads = 0;

      while (reads < n) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        x = value;
        reads++;
      }
      assert.equal(x, 'a');
    }

    for (const bufferSize of [1, 10, 100, 1000]) {
      it(`of size ${bufferSize}`, () => test(bufferSize));
    }
  });
});
