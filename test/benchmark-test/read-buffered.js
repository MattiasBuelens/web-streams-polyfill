import Benchmark from 'benchmark';
import { ReadableStream, WritableStream } from 'web-streams-polyfill';
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

async function pipe(n, bufferSize) {
  const rs = createBufferedStream(n, bufferSize);

  let x = null;
  let writes = 0;
  const ws = new WritableStream({
    write(chunk) {
      writes++;
      x = chunk;
    }
  }, {
    // Never apply backpressure
    highWaterMark: Infinity
  });

  await rs.pipeTo(ws);
  assert.equal(writes, n);
  assert.equal(x, 'a');
}

const n = 1e5;
const bufferSizes = [1, 10, 100, 1000];
for (const bufferSize of bufferSizes) {
  suite.add(
    `read loop n=${n} bufferSize=${bufferSize}`,
    deferred => readLoop(n, bufferSize).then(() => deferred.resolve()),
    { defer: true }
  );
}
for (const bufferSize of bufferSizes) {
  suite.add(
    `pipe n=${n} bufferSize=${bufferSize}`,
    deferred => pipe(n, bufferSize).then(() => deferred.resolve()),
    { defer: true }
  );
}

suite
  .on('cycle', (event) => {
    const bench = event.target;
    console.log(`${String(bench)}`);
  })
  .run({ async: true });
