import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const autoSource = fs.readFileSync(require.resolve('web-streams-polyfill/auto'), 'utf8');

function runAuto(globals) {
  const context = vm.createContext(globals);
  vm.runInContext(autoSource, context);
  return context;
}

describe('web-streams-polyfill/auto', () => {
  it('installs only the missing features on a native implementation', () => {
    // Subclasses of Node's own classes, without ReadableStream.from()
    class NativeReadableStream extends ReadableStream {}
    Object.defineProperty(NativeReadableStream, 'from', { value: undefined, configurable: true });
    const context = runAuto({
      ReadableStream: NativeReadableStream,
      WritableStream,
      TransformStream,
      AbortSignal
    });
    assert.equal(context.ReadableStream, NativeReadableStream);
    assert.equal(context.WritableStream, WritableStream);
    assert.equal(context.TransformStream, TransformStream);
    assert.equal(typeof NativeReadableStream.from, 'function');
  });

  it('installs byte streams on an implementation without them', async () => {
    class ReadableStreamWithoutBytes extends ReadableStream {
      constructor(source, strategy) {
        if (source?.type === 'bytes') {
          throw new RangeError('Byte streams are not supported');
        }
        super(source, strategy);
      }
    }
    const context = runAuto({
      ReadableStream: ReadableStreamWithoutBytes,
      WritableStream,
      TransformStream,
      AbortSignal
    });
    // The new constructor shares the native prototype, so its streams are still native streams.
    assert.equal(context.ReadableStream.prototype, ReadableStreamWithoutBytes.prototype);
    assert.equal(context.WritableStream, WritableStream);
    assert.equal(context.TransformStream, TransformStream);
    assert.equal(typeof context.ReadableByteStreamController, 'function');
    const stream = new context.ReadableStream({
      type: 'bytes',
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.close();
      }
    });
    assert.ok(stream instanceof ReadableStream);
    const { value } = await stream.getReader({ mode: 'byob' }).read(new Uint8Array(2));
    assert.deepEqual([...value], [1, 2]);
  });

  it('replaces an implementation that is not complete enough to build on', () => {
    // Without AbortSignal, there's no WritableStreamDefaultController.signal.
    const context = runAuto({
      ReadableStream,
      WritableStream,
      TransformStream
    });
    assert.notEqual(context.ReadableStream, ReadableStream);
    assert.notEqual(context.WritableStream, WritableStream);
    assert.notEqual(context.TransformStream, TransformStream);
    assert.equal(typeof context.ReadableByteStreamController, 'function');
    new context.ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
  });

  it('installs the polyfill when there are no native streams', () => {
    const context = runAuto({});
    for (const name of ['ReadableStream', 'WritableStream', 'TransformStream', 'ByteLengthQueuingStrategy']) {
      assert.equal(typeof context[name], 'function', name);
    }
    assert.equal(typeof context.ReadableStream.from, 'function');
  });
});
