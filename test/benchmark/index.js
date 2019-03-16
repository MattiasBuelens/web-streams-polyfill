const Benchmark = require('benchmark');
const polyfill = require('../../dist/polyfill.es6.js');
const stardazed = require('@stardazed/streams');
const suite = new Benchmark.Suite();

const implementations = [
  ['web-streams-polyfill', polyfill],
  ['@stardazed/streams', stardazed]
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
  return reader.read().then(result => {
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
  .on('cycle', event => {
    // eslint-disable-next-line no-console
    const bench = event.target;
    console.log(`${String(bench)} (period: ${(bench.times.period * 1000).toFixed(2)}ms)`);
  })
  .on('complete', () => {
    // eslint-disable-next-line no-console
    console.log('Done');
  })
  .run({ async: true });
