import * as assert from 'node:assert/strict';
import { runComparison } from './runner.js';
import { bufferedSource, bufferSizes, fourChunkSource, implementations, pullSource } from './helpers.js';

// Node's web streams struggle with very large queues.
const maxQueueSize = 113440;

await runComparison({
  title: 'Queue size',
  implementations,
  cases: [
    {
      // https://github.com/MattiasBuelens/web-streams-polyfill/issues/15
      name: 'readFromQueue',
      fn: async (impl, timer) => {
        const count = Math.min(timer.count, maxQueueSize);
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
        while (!(await reader.read()).done) { /* empty */ }
        timer.end(count);
      }
    }
  ]
});

await runComparison({
  title: 'Read loop',
  implementations,
  cases: bufferSizes.map(bufferSize => ({
    name: `bufferSize=${bufferSize}`,
    fn: async (impl, timer) => {
      const { count } = timer;
      const reader = bufferedSource(impl, count, bufferSize).getReader();
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
  }))
});

await runComparison({
  title: 'Iterator',
  implementations,
  cases: bufferSizes.map(bufferSize => ({
    name: `bufferSize=${bufferSize}`,
    fn: async (impl, timer) => {
      const { count } = timer;
      const rs = bufferedSource(impl, count, bufferSize);
      let x = null;
      let reads = 0;
      timer.start();
      for await (const value of rs) {
        x = value;
        reads++;
        if (reads >= count) {
          break;
        }
      }
      timer.end(count);
      assert.equal(x, 'a');
    }
  }))
});

await runComparison({
  title: 'Readable',
  implementations,
  cases: [
    {
      name: 'create ReadableStream',
      fn: (impl, timer) => {
        const { count } = timer;
        timer.start();
        for (let i = 0; i < count; i++) {
          new impl.ReadableStream();
        }
        timer.end(count);
      }
    },
    {
      name: 'reader.read() (parked)',
      fn: async (impl, timer) => {
        const { count } = timer;
        const reader = pullSource(impl, count, 0).getReader();
        timer.start();
        while (!(await reader.read()).done) { /* empty */ }
        timer.end(count);
      }
    },
    {
      name: 'for await (pull)',
      fn: async (impl, timer) => {
        const { count } = timer;
        const rs = pullSource(impl, count);
        timer.start();
        for await (const chunk of rs) {
          void chunk;
        }
        timer.end(count);
      }
    },
    {
      name: 'ReadableStream.from(array)',
      fn: async (impl, timer) => {
        const { count } = timer;
        const arr = new Array(count).fill('a');
        timer.start();
        for await (const chunk of impl.ReadableStream.from(arr)) {
          void chunk;
        }
        timer.end(count);
      }
    },
    {
      name: 'byob read (bytes)',
      fn: async (impl, timer) => {
        const { count } = timer;
        let i = 0;
        const rs = new impl.ReadableStream({
          type: 'bytes',
          pull(c) {
            const v = c.byobRequest.view;
            v[0] = 1;
            c.byobRequest.respond(1);
            if (++i >= count) c.close();
          }
        });
        const reader = rs.getReader({ mode: 'byob' });
        let buf = new Uint8Array(16);
        timer.start();
        for (;;) {
          const { value, done } = await reader.read(buf);
          if (done) break;
          buf = new Uint8Array(value.buffer);
        }
        timer.end(count);
      }
    },
    {
      name: 'lifecycle: 4 chunks, for await',
      fn: async (impl, timer) => {
        const { count } = timer;
        timer.start();
        for (let i = 0; i < count; i++) {
          for await (const chunk of fourChunkSource(impl)) {
            void chunk;
          }
        }
        timer.end(count);
      }
    }
  ]
});
