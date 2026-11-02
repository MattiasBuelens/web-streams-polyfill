import { runComparison } from './runner.js';
import { implementations, nullSink, pullSource } from './helpers.js';

await runComparison({
  title: 'Transform',
  implementations,
  cases: [
    {
      name: 'create TransformStream',
      fn: (impl, timer) => {
        const { count } = timer;
        timer.start();
        for (let i = 0; i < count; i++) {
          new impl.TransformStream();
        }
        timer.end(count);
      }
    },
    {
      name: 'pipeThrough passthrough',
      fn: async (impl, timer) => {
        const { count } = timer;
        const rs = pullSource(impl, count);
        timer.start();
        await rs.pipeThrough(new impl.TransformStream()).pipeTo(nullSink(impl));
        timer.end(count);
      }
    },
    {
      name: 'pipeThrough transform()',
      fn: async (impl, timer) => {
        const { count } = timer;
        const rs = pullSource(impl, count);
        timer.start();
        await rs.pipeThrough(new impl.TransformStream({
          transform(c, ctl) {
            ctl.enqueue(c);
          }
        })).pipeTo(nullSink(impl));
        timer.end(count);
      }
    }
  ]
});
