import { prettyReport, Suite, textReport } from 'bench-node';
import * as polyfill from 'web-streams-polyfill';
import * as node from 'node:stream/web';

const { CI } = process.env;
const suite = new Suite({
  reporter: CI ? textReport : prettyReport,
  repeatSuite: CI ? 30 : 1,
  ttest: Boolean(CI)
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

suite.add(
  `readFromQueue/node:web-streams`,
  { baseline: true },
  async timer => readFromQueue(node, timer)
);
suite.add(
  `readFromQueue/web-streams-polyfill`,
  async timer => readFromQueue(polyfill, timer)
);

await suite.run();
