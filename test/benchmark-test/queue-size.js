import * as baseline from 'web-streams-polyfill-baseline';
import * as polyfill from 'web-streams-polyfill';
import * as node from 'node:stream/web';
import { runComparison } from './runner.js';

// Node's web streams struggle with very large queues.
const maxCount = 113440;

// https://github.com/MattiasBuelens/web-streams-polyfill/issues/15
async function readFromQueue(impl, timer) {
  const count = Math.min(timer.count, maxCount);
  timer.start();
  const rs = new impl.ReadableStream({
    start(controller) {
      for (let i = 0; i < count; ++i) {
        controller.enqueue(i);
      }
      controller.close();
    }
  });
  const reader = rs.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
  }
  timer.end(count);
}

await runComparison({
  title: 'Queue size',
  implementations: { baseline, polyfill, node },
  cases: [{ name: 'readFromQueue', fn: readFromQueue }]
});
