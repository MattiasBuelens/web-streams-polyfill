// Workloads modeled on Node's benchmark/webstreams suite: compares the polyfill against
// the last release (baseline) and native Node streams.
import * as baseline from 'web-streams-polyfill-baseline';
import * as polyfill from 'web-streams-polyfill';
import * as node from 'node:stream/web';
import { runComparison } from './runner.js';

function pullSource(impl, n, hwm = 1) {
  let i = 0;
  return new impl.ReadableStream({
    pull(c) {
      if (i++ < n) {
        c.enqueue('a');
      } else {
        c.close();
      }
    }
  }, { highWaterMark: hwm });
}

const sink = impl => new impl.WritableStream({ write() {} });

const cases = [
  {
    name: 'pipeTo hwm=1',
    fn: async (impl, timer) => {
      const { count } = timer;
      const rs = pullSource(impl, count);
      timer.start();
      await rs.pipeTo(sink(impl));
      timer.end(count);
    }
  },
  {
    name: 'pipeTo hwm=1024',
    fn: async (impl, timer) => {
      const { count } = timer;
      const rs = pullSource(impl, count, 1024);
      timer.start();
      await rs.pipeTo(new impl.WritableStream({ write() {} }, { highWaterMark: 1024 }));
      timer.end(count);
    }
  },
  {
    name: 'pipeThrough passthrough',
    fn: async (impl, timer) => {
      const { count } = timer;
      const rs = pullSource(impl, count);
      timer.start();
      await rs.pipeThrough(new impl.TransformStream()).pipeTo(sink(impl));
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
      })).pipeTo(sink(impl));
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
    name: 'tee, read both',
    fn: async (impl, timer) => {
      const { count } = timer;
      const [a, b] = pullSource(impl, count).tee();
      timer.start();
      await Promise.all([a.pipeTo(sink(impl)), b.pipeTo(sink(impl))]);
      timer.end(count);
    }
  },
  {
    name: 'writer.write() await',
    fn: async (impl, timer) => {
      const { count } = timer;
      const writer = sink(impl).getWriter();
      timer.start();
      for (let i = 0; i < count; i++) {
        await writer.write('a');
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
    name: 'create ReadableStream',
    fn: (impl, timer) => {
      const { count } = timer;
      timer.start();
      for (let i = 0; i < count; i++) new impl.ReadableStream();
      timer.end(count);
    }
  },
  {
    name: 'create WritableStream',
    fn: (impl, timer) => {
      const { count } = timer;
      timer.start();
      for (let i = 0; i < count; i++) new impl.WritableStream();
      timer.end(count);
    }
  },
  {
    name: 'create TransformStream',
    fn: (impl, timer) => {
      const { count } = timer;
      timer.start();
      for (let i = 0; i < count; i++) new impl.TransformStream();
      timer.end(count);
    }
  },
  {
    name: 'lifecycle: 4 chunks, for await',
    fn: async (impl, timer) => {
      const { count } = timer;
      timer.start();
      for (let i = 0; i < count; i++) {
        const rs = new impl.ReadableStream({
          start(c) {
            c.enqueue('a');
            c.enqueue('b');
            c.enqueue('c');
            c.enqueue('d');
            c.close();
          }
        });
        for await (const chunk of rs) {
          void chunk;
        }
      }
      timer.end(count);
    }
  },
  {
    name: 'lifecycle: 4 chunks, pipeThrough+pipeTo',
    fn: async (impl, timer) => {
      const { count } = timer;
      timer.start();
      for (let i = 0; i < count; i++) {
        const rs = new impl.ReadableStream({
          start(c) {
            c.enqueue('a');
            c.enqueue('b');
            c.enqueue('c');
            c.enqueue('d');
            c.close();
          }
        });
        await rs.pipeThrough(new impl.TransformStream()).pipeTo(sink(impl));
      }
      timer.end(count);
    }
  }
];

await runComparison({ title: 'Workloads', implementations: { node, baseline, polyfill }, cases });
