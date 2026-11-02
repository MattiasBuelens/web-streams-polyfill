const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { WritableStream } = require('web-streams-polyfill');

const flush = () => new Promise(resolve => setImmediate(resolve));
const settledState = promise => promise.then(
  () => 'fulfilled',
  reason => `rejected: ${reason}`
);

describe('WritableStreamDefaultWriter', () => {
  describe('closed', () => {
    it('stays pending while the sink abort() is pending, when first accessed after abort()', async () => {
      let finishAbort;
      const writer = new WritableStream({
        abort() {
          return new Promise((resolve) => {
            finishAbort = resolve;
          });
        }
      }).getWriter();
      await flush();
      const abort = writer.abort('reason');
      let settled = false;
      writer.closed.catch(() => {
        settled = true;
      });
      await flush();
      assert.equal(settled, false);
      finishAbort();
      await abort;
      await flush();
      assert.equal(settled, true);
      assert.equal(await settledState(writer.closed), 'rejected: reason');
    });

    it('is rejected when the sink abort() finishes, when first accessed afterwards', async () => {
      const writer = new WritableStream().getWriter();
      await flush();
      await writer.abort('reason');
      assert.equal(await settledState(writer.closed), 'rejected: reason');
    });

    it('is rejected immediately for a writer acquired while the sink abort() is pending', async () => {
      let finishAbort;
      const ws = new WritableStream({
        abort() {
          return new Promise((resolve) => {
            finishAbort = resolve;
          });
        }
      });
      const writer1 = ws.getWriter();
      await flush();
      const abort = writer1.abort('reason');
      writer1.releaseLock();
      const writer2 = ws.getWriter();
      assert.equal(await settledState(writer2.closed), 'rejected: reason');
      finishAbort();
      await abort;
    });
  });

  describe('ready', () => {
    it('stays rejected after an in-flight close succeeds following abort()', async () => {
      let finishClose;
      const writer = new WritableStream({
        close() {
          return new Promise((resolve) => {
            finishClose = resolve;
          });
        }
      }).getWriter();
      const closing = writer.close();
      await flush();
      const aborting = writer.abort('late abort');
      finishClose();
      await Promise.all([closing, aborting]);
      assert.equal(await settledState(writer.ready), 'rejected: late abort');
    });
  });
});
