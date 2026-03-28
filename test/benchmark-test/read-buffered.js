import Benchmark from 'benchmark';
import { ReadableStream } from 'web-streams-polyfill';
import * as assert from 'node:assert/strict';

const suite = new Benchmark.Suite('read buffered');

// https://github.com/nodejs/node/commit/199daab0b0822d6063a73b9362bfce8667d2a112
function createBufferedStream(n, bufferSize) {
  let enqueued = 0;
  return new ReadableStream({
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
    // Use buffer size as high watermark to allow pre-buffering
    highWaterMark: bufferSize
  });
}

async function readLoop(n, bufferSize) {
  const rs = createBufferedStream(n, bufferSize);

  const reader = rs.getReader();
  let x = null;
  let reads = 0;

  while (reads < n) {
    const { value, done } = await reader.read();
    if (done) break;
    x = value;
    reads++;
  }
  assert.equal(x, 'a');
}

for (const bufferSize of [1, 10, 100, 1000]) {
  const n = 1e5;
  suite.add(
    `read loop n=${n} bufferSize=${bufferSize}`,
    deferred => readLoop(n, bufferSize).then(() => deferred.resolve()),
    { defer: true }
  );
}

suite
  .on('cycle', (event) => {
    const bench = event.target;
    console.log(`${String(bench)} (period: ${(bench.times.period * 1000).toFixed(2)}ms)`);
  })
  .on('complete', () => {
    console.log('Done');
  })
  .run({ async: true });
