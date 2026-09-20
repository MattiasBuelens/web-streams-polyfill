const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createHook } = require('node:async_hooks');
const { ReadableStream, WritableStream } = require('web-streams-polyfill');

describe('ReadableStream.pipeTo', () => {
  it('does not retain a growing promise chain while waiting for backpressure', async () => {
    const pendingPromises = new Set();
    const samples = [];
    const hook = createHook({
      init(id, type) {
        if (type === 'PROMISE') {
          pendingPromises.add(id);
        }
      },
      promiseResolve(id) {
        pendingPromises.delete(id);
      }
    });
    const count = 8192;
    let enqueued = 0;
    let written = 0;
    const source = new ReadableStream({
      pull(controller) {
        if (enqueued++ < count) {
          controller.enqueue('a');
        } else {
          controller.close();
        }
      }
    });
    const destination = new WritableStream({
      write() {
        if (++written % 1024 === 0) {
          samples.push(pendingPromises.size);
        }
      }
    });

    hook.enable();
    try {
      await source.pipeTo(destination);
    } finally {
      hook.disable();
    }

    assert.equal(written, count);
    assert.equal(source.locked, false);
    assert.equal(destination.locked, false);
    // Allow fixed bookkeeping overhead, but not growth proportional to chunks.
    // Unlike heap measurements, this does not depend on garbage collection.
    assert.ok(Math.max(...samples) <= samples[0] + 32,
      `Pending promises grew during piping: ${samples.join(', ')}`);
  });

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
