import { runComparison } from './runner.js';
import { implementations, nullSink } from './helpers.js';

await runComparison({
  title: 'Writable',
  implementations,
  cases: [
    {
      name: 'create WritableStream',
      fn: (impl, timer) => {
        const { count } = timer;
        timer.start();
        for (let i = 0; i < count; i++) {
          new impl.WritableStream();
        }
        timer.end(count);
      }
    },
    {
      name: 'writer.write() await',
      fn: async (impl, timer) => {
        const { count } = timer;
        const writer = nullSink(impl).getWriter();
        timer.start();
        for (let i = 0; i < count; i++) {
          await writer.write('a');
        }
        timer.end(count);
      }
    }
  ]
});
