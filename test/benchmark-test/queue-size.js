import { prettyReport, Suite, textReport } from 'bench-node';
import * as baseline from 'web-streams-polyfill-baseline';
import * as polyfill from 'web-streams-polyfill';
import * as node from 'node:stream/web';

const { BENCH_REPORTER, BENCH_TTEST } = process.env;
const suite = new Suite({
  reporter: BENCH_REPORTER === 'text' ? textReport : prettyReport,
  ttest: Boolean(BENCH_TTEST)
});

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

for (const [name, impl] of Object.entries({ baseline, polyfill, node })) {
  suite.add(
    `readFromQueue/${name}`,
    { baseline: name === 'baseline' },
    async timer => readFromQueue(impl, timer)
  );
}

await suite.run();
