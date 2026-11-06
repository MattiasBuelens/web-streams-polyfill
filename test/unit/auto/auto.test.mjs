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

  it('replaces an implementation that is not complete enough to build on', () => {
    // A ReadableStream without byte streams
    class IncompleteReadableStream extends ReadableStream {
      constructor(source, strategy) {
        if (source?.type === 'bytes') {
          throw new RangeError('Byte streams are not supported');
        }
        super(source, strategy);
      }
    }
    const context = runAuto({
      ReadableStream: IncompleteReadableStream,
      WritableStream,
      TransformStream,
      AbortSignal
    });
    assert.notEqual(context.ReadableStream, IncompleteReadableStream);
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
