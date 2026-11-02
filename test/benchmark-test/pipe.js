import * as assert from 'node:assert/strict';
import { runComparison } from './runner.js';
import { bufferedSource, bufferSizes, fourChunkSource, implementations, nullSink, pullSource } from './helpers.js';

await runComparison({
  title: 'Pipe (buffered)',
  implementations,
  cases: bufferSizes.map(bufferSize => ({
    name: `bufferSize=${bufferSize}`,
    fn: async (impl, timer) => {
      const { count } = timer;
      const rs = bufferedSource(impl, count, bufferSize);
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
  }))
});

await runComparison({
  title: 'Pipe',
  implementations,
  cases: [
    {
      name: 'pipeTo hwm=1',
      fn: async (impl, timer) => {
        const { count } = timer;
        const rs = pullSource(impl, count);
        timer.start();
        await rs.pipeTo(nullSink(impl));
        timer.end(count);
      }
    },
    {
      name: 'pipeTo hwm=1024',
      fn: async (impl, timer) => {
        const { count } = timer;
        const rs = pullSource(impl, count, 1024);
        timer.start();
        await rs.pipeTo(nullSink(impl, 1024));
        timer.end(count);
      }
    },
    {
      name: 'lifecycle: 4 chunks, pipeThrough+pipeTo',
      fn: async (impl, timer) => {
        const { count } = timer;
        timer.start();
        for (let i = 0; i < count; i++) {
          await fourChunkSource(impl).pipeThrough(new impl.TransformStream()).pipeTo(nullSink(impl));
        }
        timer.end(count);
      }
    }
  ]
});
