import Benchmark from 'benchmark';
import * as polyfill from 'web-streams-polyfill';
import * as stardazed from '@stardazed/streams';
import * as node from 'node:stream/web';

const suite = new Benchmark.Suite();

const implementations = [
  ['web-streams-polyfill', polyfill],
  ['@stardazed/streams', stardazed],
  ['node:stream/web', node]
];

// https://github.com/MattiasBuelens/web-streams-polyfill/issues/15
function testCount(impl, count, deferred) {
  const rs = new impl.ReadableStream({
    start(controller) {
      for (let i = 0; i < count; ++i) {
        controller.enqueue(i);
      }
      controller.close();
    }
  });
  const reader = rs.getReader();
  return readLoop(count, reader)
    .then(() => deferred.resolve());
}

function readLoop(count, reader) {
  return reader.read().then((result) => {
    if (result.done) {
      return undefined;
    }
    return readLoop(count, reader);
  });
}

for (const [name, impl] of implementations) {
  for (let count = 3545; count <= 113440; count *= 2) {
    suite.add(
      `${name} testCount(${count})`,
      deferred => testCount(impl, count, deferred),
      { defer: true }
    );
  }
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
