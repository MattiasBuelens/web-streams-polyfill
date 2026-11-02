const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { ReadableStream, WritableStream, TransformStream } = require('web-streams-polyfill');

// Internal shortcuts (such as notifying a pipe directly instead of through a promise reaction)
// must not change which async context runs the user's source, sink and transformer callbacks.
// Each test logs `<callback>:<store>` for every callback it observes.
// The expectations match the promise-based implementation, and agree with native streams in Node.js 22.

const als = new AsyncLocalStorage();

function delay() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createLog() {
  const entries = [];
  return {
    add(name) {
      entries.push(`${name}:${als.getStore() ?? 'none'}`);
    },
    toString() {
      return entries.join(' ');
    }
  };
}

describe('async context', () => {
  describe('ReadableStream.pipeTo', () => {
    it('closes the destination in the context of the pipe', async () => {
      const log = createLog();
      let controller;
      const rs = new ReadableStream({
        start(c) {
          controller = c;
        }
      });
      const ws = new WritableStream({
        write() {
          log.add('write');
        },
        close() {
          log.add('close');
        }
      });
      const promise = als.run('piper', () => rs.pipeTo(ws));
      await delay();
      als.run('other', () => {
        controller.enqueue('a');
        controller.close();
      });
      await promise;
      assert.equal(log.toString(), 'write:other close:piper');
    });

    it('aborts the destination in the context of the pipe', async () => {
      const log = createLog();
      let controller;
      const rs = new ReadableStream({
        start(c) {
          controller = c;
        }
      });
      const ws = new WritableStream({
        abort() {
          log.add('abort');
        }
      });
      const promise = als.run('piper', () => rs.pipeTo(ws));
      await delay();
      als.run('other', () => controller.error(new Error('boom')));
      await assert.rejects(promise);
      assert.equal(log.toString(), 'abort:piper');
    });

    it('cancels the source in the context of the pipe when the destination errors', async () => {
      const log = createLog();
      const rs = new ReadableStream({
        cancel() {
          log.add('cancel');
        }
      });
      let controller;
      const ws = new WritableStream({
        start(c) {
          controller = c;
        }
      });
      const promise = als.run('piper', () => rs.pipeTo(ws));
      await delay();
      als.run('other', () => controller.error(new Error('boom')));
      await assert.rejects(promise);
      assert.equal(log.toString(), 'cancel:piper');
    });

    it('cancels the source in the context of the pipe when a write fails', async () => {
      const log = createLog();
      let rejectWrite;
      const rs = new ReadableStream({
        start(c) {
          c.enqueue('a');
        },
        cancel() {
          log.add('cancel');
        }
      });
      const ws = new WritableStream({
        write() {
          return new Promise((_, reject) => {
            rejectWrite = reject;
          });
        }
      });
      const promise = als.run('piper', () => rs.pipeTo(ws));
      await delay();
      als.run('other', () => rejectWrite(new Error('boom')));
      await assert.rejects(promise);
      assert.equal(log.toString(), 'cancel:piper');
    });

    it('runs abort steps in the context that aborts the signal', async () => {
      const log = createLog();
      const rs = new ReadableStream({
        cancel() {
          log.add('cancel');
        }
      });
      const ws = new WritableStream({
        abort() {
          log.add('abort');
        }
      });
      const abortController = new AbortController();
      const promise = als.run('piper', () => rs.pipeTo(ws, { signal: abortController.signal }));
      await delay();
      als.run('other', () => abortController.abort());
      await assert.rejects(promise);
      assert.equal(log.toString(), 'abort:other cancel:other');
    });

    it('pulls in the context of the pipe when writes complete in another context', async () => {
      const log = createLog();
      const pendingWrites = [];
      let pulls = 0;
      const rs = new ReadableStream({
        pull(c) {
          log.add('pull');
          if (++pulls > 3) {
            c.close();
          } else {
            c.enqueue(pulls);
          }
        }
      }, { highWaterMark: 0 });
      const ws = new WritableStream({
        write() {
          return new Promise((resolve) => {
            pendingWrites.push(resolve);
          });
        },
        close() {
          log.add('close');
        }
      }, { highWaterMark: 1 });
      const promise = als.run('piper', () => rs.pipeTo(ws));
      for (let i = 0; i < 6; i++) {
        await delay();
        als.run('other', () => {
          while (pendingWrites.length > 0) {
            pendingWrites.shift()();
          }
        });
      }
      await promise;
      assert.equal(log.toString(), 'pull:none pull:piper pull:piper pull:piper close:piper');
    });
  });

  describe('ReadableStream.pipeThrough', () => {
    it('closes the destination in the context of the pipe', async () => {
      const log = createLog();
      const ts = new TransformStream({
        transform(chunk, c) {
          log.add('transform');
          c.enqueue(chunk);
        },
        flush() {
          log.add('flush');
        }
      });
      const ws = new WritableStream({
        write() {
          log.add('write');
        },
        close() {
          log.add('close');
        }
      });
      const promise = als.run('piper', () => ts.readable.pipeTo(ws));
      const writer = ts.writable.getWriter();
      await als.run('other', async () => {
        await writer.write('a');
        await writer.close();
      });
      await promise;
      assert.equal(log.toString(), 'transform:none write:none flush:other close:piper');
    });
  });

  describe('ReadableStream.tee', () => {
    it('errors the branches in the context of the tee', async () => {
      const log = createLog();
      let controller;
      const rs = new ReadableStream({
        start(c) {
          controller = c;
        }
      });
      const [branch1, branch2] = als.run('teer', () => rs.tee());
      const ws = new WritableStream({
        abort() {
          log.add('abort');
        }
      });
      const promise = als.run('piper', () => branch1.pipeTo(ws));
      branch2.cancel();
      await delay();
      als.run('other', () => controller.error(new Error('boom')));
      await assert.rejects(promise);
      assert.equal(log.toString(), 'abort:piper');
    });
  });
});
