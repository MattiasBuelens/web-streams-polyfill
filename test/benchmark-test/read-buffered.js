import { prettyReport, Suite, textReport } from 'bench-node';
import * as baseline from 'web-streams-polyfill-baseline';
import * as polyfill from 'web-streams-polyfill';
import * as node from 'node:stream/web';
import * as assert from 'node:assert/strict';

const { BENCH_REPORTER, BENCH_TTEST } = process.env;
const suiteOptions = {
  reporter: BENCH_REPORTER === 'text' ? textReport : prettyReport,
  ttest: Boolean(BENCH_TTEST)
};

// https://github.com/nodejs/node/commit/199daab0b0822d6063a73b9362bfce8667d2a112
function createBufferedStream(impl, n, bufferSize) {
  let enqueued = 0;
  return new impl.ReadableStream({
    start(controller) {
      // Pre-fill the buffer
      for (let i = 0; i < Math.min(bufferSize, n); i++) {
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

async function readLoop(impl, bufferSize, timer) {
  const { count } = timer;
  const rs = createBufferedStream(impl, count, bufferSize);

  const reader = rs.getReader();
  let x = null;
  let reads = 0;

  timer.start();
  while (reads < count) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    x = value;
    reads++;
  }
  timer.end(count);
  assert.equal(x, 'a');
}

async function pipe(impl, bufferSize, timer) {
  const { count } = timer;
  const rs = createBufferedStream(impl, count, bufferSize);

  let x = null;
  let writes = 0;
  const ws = new impl.WritableStream({
    write(chunk) {
      writes++;
      x = chunk;
    }
  }, {
    // Never apply backpressure
    highWaterMark: Infinity
  });

  timer.start();
  await rs.pipeTo(ws);
  timer.end(count);
  assert.equal(writes, count);
  assert.equal(x, 'a');
}

const readLoopSuite = new Suite(suiteOptions);
const pipeSuite = new Suite(suiteOptions);
const bufferSizes = [1, 10, 100, 1000];
for (const [name, impl] of Object.entries({ baseline, polyfill, node })) {
  for (const bufferSize of bufferSizes) {
    const options = { baseline: name === 'baseline' && bufferSize === 1 };
    readLoopSuite.add(
      `read loop/${name}/bufferSize=${bufferSize}`,
      options,
      async timer => readLoop(impl, bufferSize, timer)
    );
    pipeSuite.add(
      `pipe/${name}/bufferSize=${bufferSize}`,
      options,
      async timer => pipe(impl, bufferSize, timer)
    );
  }
}

await readLoopSuite.run();
await pipeSuite.run();
