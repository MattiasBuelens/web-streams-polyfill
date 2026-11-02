import { runComparison } from './runner.js';
import { implementations, nullSink, pullSource } from './helpers.js';

await runComparison({
  title: 'Tee',
  implementations,
  cases: [
    {
      name: 'tee, read both',
      fn: async (impl, timer) => {
        const { count } = timer;
        const [a, b] = pullSource(impl, count).tee();
        timer.start();
        await Promise.all([a.pipeTo(nullSink(impl)), b.pipeTo(nullSink(impl))]);
        timer.end(count);
      }
    }
  ]
});
