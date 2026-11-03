import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check, install } from 'web-streams-polyfill/feature/transformer-cancel';

/**
 * Node.js already supports transformer.cancel(), so wrap its TransformStream in one that hides cancel().
 */
function createClasses() {
  const NativeTransformStream = new Proxy(globalThis.TransformStream, {
    construct(target, args, newTarget) {
      const [transformer] = args;
      if (transformer !== null && typeof transformer === 'object' && 'cancel' in transformer) {
        const withoutCancel = { ...transformer };
        delete withoutCancel.cancel;
        args = [withoutCancel, ...args.slice(1)];
      }
      return Reflect.construct(target, args, newTarget === NativeTransformStream ? target : newTarget);
    }
  });
  return {
    ReadableStream: globalThis.ReadableStream,
    WritableStream: globalThis.WritableStream,
    TransformStream: NativeTransformStream
  };
}

describe('transformer-cancel feature', () => {
  it('installs on top of native streams', async () => {
    const classes = createClasses();
    assert.equal(check(classes), false);
    assert.equal(install(classes), true);
    assert.equal(check(classes), true);

    let cancelReason;
    const ts = new classes.TransformStream({
      cancel(reason) {
        cancelReason = reason;
      }
    });
    await ts.readable.cancel('reason');
    assert.equal(cancelReason, 'reason');
  });

  it('installs on a subclass of the native TransformStream', async () => {
    const classes = createClasses();
    class TransformStreamSubclass extends classes.TransformStream {}
    classes.TransformStream = TransformStreamSubclass;
    assert.equal(install(classes), true);

    let called = false;
    const ts = new classes.TransformStream({
      cancel() {
        called = true;
      }
    });
    assert.ok(ts instanceof TransformStreamSubclass);
    await ts.readable.cancel();
    assert.ok(called);
  });

  it('reads each transformer member once', async () => {
    const classes = createClasses();
    install(classes);

    for (const withCancel of [false, true]) {
      const reads = [];
      const calls = [];
      const transformer = {
        get start() {
          reads.push('start');
          // Return a different function on each read
          const n = reads.filter(read => read === 'start').length;
          return () => calls.push(`start ${n}`);
        },
        get transform() {
          reads.push('transform');
          return (chunk, controller) => controller.enqueue(chunk);
        }
      };
      if (withCancel) {
        transformer.cancel = () => {};
      }
      const ts = new classes.TransformStream(transformer);
      assert.deepEqual(reads, ['start', 'transform'], `withCancel = ${withCancel}`);
      assert.deepEqual(calls, ['start 1'], `withCancel = ${withCancel}`);
      await ts.readable.cancel();
    }
  });

  it('rejects readable.cancel() after the writable strategy\'s size() throws', async () => {
    const classes = createClasses();
    install(classes);

    const error = new Error('size failed');
    const ts = new classes.TransformStream({ cancel() {} }, {
      size() {
        throw error;
      }
    });
    const writer = ts.writable.getWriter();
    await assert.rejects(writer.write('a'), error);
    await assert.rejects(ts.readable.cancel(), error);
  });

  it('rejects readable.cancel() after the writable strategy\'s size() returns an invalid size', async () => {
    const classes = createClasses();
    install(classes);

    const ts = new classes.TransformStream({ cancel() {} }, {
      size() {
        return -1;
      }
    });
    const writer = ts.writable.getWriter();
    await assert.rejects(writer.write('a'), RangeError);
    await assert.rejects(ts.readable.cancel(), RangeError);
  });
});
