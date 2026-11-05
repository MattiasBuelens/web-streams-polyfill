import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as extendNative from 'web-streams-polyfill/extend-native';

const require = createRequire(import.meta.url);
const extendNativeSource = fs.readFileSync(require.resolve('web-streams-polyfill/extend-native'), 'utf8');

/**
 * Loads the CommonJS build of `web-streams-polyfill/extend-native` with the given globals.
 */
function loadExtendNative(globals) {
  const context = vm.createContext(globals);
  const module = { exports: {} };
  vm.runInContext(`(function (exports, module) {\n${extendNativeSource}\n})`, context)(module.exports, module);
  return module.exports;
}

/**
 * Snapshots the own properties of the given objects, to check that nothing changed them.
 */
function snapshot(...objects) {
  return objects.map(object => Object.getOwnPropertyDescriptors(object));
}

/**
 * Subclasses of Node's own stream classes, without any of the features that the feature modules install.
 * (Node.js implements all of them.)
 */
function createIncompleteClasses() {
  class IncompleteBYOBReader extends ReadableStreamBYOBReader {
    read(view) {
      // Ignore the options, including `min`.
      return super.read(view);
    }
  }

  class IncompleteReadableStream extends ReadableStream {
    getReader(options) {
      const reader = super.getReader(options);
      if (reader instanceof ReadableStreamBYOBReader) {
        Object.setPrototypeOf(reader, IncompleteBYOBReader.prototype);
      }
      return reader;
    }
  }
  Object.defineProperty(IncompleteReadableStream, 'from', { value: undefined, configurable: true });
  Object.defineProperty(IncompleteReadableStream.prototype, 'values', { value: undefined, configurable: true });
  Object.defineProperty(IncompleteReadableStream.prototype, Symbol.asyncIterator, { value: undefined, configurable: true });

  class IncompleteTransformStream extends TransformStream {
    constructor(transformer, ...strategies) {
      if (transformer !== null && typeof transformer === 'object' && 'cancel' in transformer) {
        const { cancel: _cancel, ...withoutCancel } = transformer;
        transformer = withoutCancel;
      }
      super(transformer, ...strategies);
    }
  }

  return { IncompleteReadableStream, IncompleteBYOBReader, IncompleteTransformStream };
}

describe('web-streams-polyfill/extend-native', () => {
  it('exports subclasses of the native classes', () => {
    assert.equal(Object.getPrototypeOf(extendNative.ReadableStream), ReadableStream);
    assert.equal(Object.getPrototypeOf(extendNative.WritableStream), WritableStream);
    assert.equal(Object.getPrototypeOf(extendNative.ReadableStreamBYOBReader), ReadableStreamBYOBReader);
    // Node.js supports transformer.cancel(), so the TransformStream class isn't replaced.
    assert.equal(Object.getPrototypeOf(extendNative.TransformStream), TransformStream);
    assert.equal(extendNative.ReadableStreamDefaultReader, ReadableStreamDefaultReader);
    assert.equal(extendNative.TransformStreamDefaultController, TransformStreamDefaultController);
    assert.equal(extendNative.CountQueuingStrategy, CountQueuingStrategy);
  });

  it('constructs streams that work with platform APIs', async () => {
    const stream = new extendNative.ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('hello'));
        c.close();
      }
    });
    assert.ok(stream instanceof extendNative.ReadableStream);
    assert.ok(stream instanceof ReadableStream);
    assert.equal(await new Response(stream).text(), 'hello');
  });

  it('converts the streams returned by its own methods', async () => {
    const stream = extendNative.ReadableStream.from(['a', 'b']);
    assert.ok(stream instanceof extendNative.ReadableStream);

    const [branch1, branch2] = stream.tee();
    assert.ok(branch1 instanceof extendNative.ReadableStream);
    assert.ok(branch2 instanceof extendNative.ReadableStream);

    // pipeThrough() with a platform transform stream
    const encoded = branch1.pipeThrough(new TextEncoderStream());
    assert.ok(encoded instanceof extendNative.ReadableStream);
    assert.equal(await new Response(encoded).text(), 'ab');

    const transform = new extendNative.TransformStream();
    assert.ok(transform.readable instanceof extendNative.ReadableStream);
    assert.ok(transform.writable instanceof extendNative.WritableStream);

    const byobReader = new extendNative.ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
    assert.ok(byobReader instanceof extendNative.ReadableStreamBYOBReader);

    const chunks = [];
    for await (const chunk of branch2) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ['a', 'b']);
  });

  it('adopts native streams in place', async () => {
    const body = new Response('hello').body;
    assert.equal(extendNative.adopt(body), body);
    assert.ok(body instanceof extendNative.ReadableStream);
    assert.equal(extendNative.adopt(body), body);
    assert.equal(await new Response(body).text(), 'hello');

    const writable = new WritableStream();
    assert.equal(extendNative.adopt(writable), writable);
    assert.ok(writable instanceof extendNative.WritableStream);

    // A CompressionStream is not a TransformStream, but its sides can be adopted.
    const compression = new CompressionStream('gzip');
    assert.throws(() => extendNative.adopt(compression), TypeError);
    assert.ok(extendNative.adopt(compression.readable) instanceof extendNative.ReadableStream);
    assert.ok(extendNative.adopt(compression.writable) instanceof extendNative.WritableStream);

    const transform = new TransformStream();
    assert.equal(extendNative.adopt(transform), transform);
    assert.ok(transform instanceof extendNative.TransformStream);
    assert.ok(transform.readable instanceof extendNative.ReadableStream);
  });

  it('only adopts streams', () => {
    for (const value of [undefined, null, 'stream', {}, { readable: {}, writable: {} }, Object.create(ReadableStream.prototype)]) {
      assert.throws(() => extendNative.adopt(value), TypeError);
    }
  });

  it('leaves the native classes untouched', () => {
    const before = snapshot(ReadableStream, ReadableStream.prototype, ReadableStreamBYOBReader.prototype, TransformStream.prototype);
    const exports = loadExtendNative({ ReadableStream, WritableStream, TransformStream, AbortSignal });
    assert.equal(Object.getPrototypeOf(exports.ReadableStream), ReadableStream);
    const after = snapshot(ReadableStream, ReadableStream.prototype, ReadableStreamBYOBReader.prototype, TransformStream.prototype);
    assert.deepEqual(after, before);
  });

  describe('on an implementation without the features', () => {
    const { IncompleteReadableStream, IncompleteBYOBReader, IncompleteTransformStream } = createIncompleteClasses();
    const globals = [
      IncompleteReadableStream,
      IncompleteReadableStream.prototype,
      IncompleteBYOBReader.prototype,
      IncompleteTransformStream,
      IncompleteTransformStream.prototype,
      TransformStreamDefaultController.prototype
    ];
    const before = snapshot(...globals);
    const exports = loadExtendNative({
      ReadableStream: IncompleteReadableStream,
      WritableStream,
      TransformStream: IncompleteTransformStream,
      AbortSignal
    });

    it('installs the features on its own classes only', () => {
      assert.equal(typeof exports.ReadableStream.from, 'function');
      assert.equal(typeof exports.ReadableStream.prototype.values, 'function');
      assert.equal(typeof exports.ReadableStream.prototype[Symbol.asyncIterator], 'function');
      assert.deepEqual(snapshot(...globals), before);
    });

    it('supports ReadableStream.from() and async iteration', async () => {
      const stream = exports.ReadableStream.from(['a', 'b']);
      assert.ok(stream instanceof exports.ReadableStream);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      assert.deepEqual(chunks, ['a', 'b']);
    });

    it('supports read(view, { min })', async () => {
      let controller;
      const stream = new exports.ReadableStream({
        type: 'bytes',
        start(c) {
          controller = c;
        }
      });
      const reader = stream.getReader({ mode: 'byob' });
      assert.ok(reader instanceof exports.ReadableStreamBYOBReader);
      const readPromise = reader.read(new Uint8Array(4), { min: 4 });
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4]));
      const { value, done } = await readPromise;
      assert.equal(done, false);
      assert.deepEqual([...value], [1, 2, 3, 4]);

      // A native reader of the same class doesn't get the feature.
      const nativeReader = new IncompleteReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
      assert.equal(Object.getPrototypeOf(nativeReader), IncompleteBYOBReader.prototype);
    });

    it('supports transformer.cancel()', async () => {
      let cancelReason;
      const transform = new exports.TransformStream({
        cancel(reason) {
          cancelReason = reason;
        }
      });
      assert.ok(transform instanceof exports.TransformStream);
      assert.ok(transform.readable instanceof exports.ReadableStream);
      assert.ok(transform.writable instanceof exports.WritableStream);
      await transform.readable.cancel('reason');
      assert.equal(cancelReason, 'reason');

      // Without transformer.cancel(), this is still a native TransformStream, with converted sides.
      const plain = new exports.TransformStream();
      assert.ok(plain instanceof exports.TransformStream);
      assert.ok(plain.readable instanceof exports.ReadableStream);
      structuredClone(plain, { transfer: [plain] });
    });

    it('adopts native transform streams', () => {
      const transform = new IncompleteTransformStream();
      assert.equal(exports.adopt(transform), transform);
      assert.ok(transform instanceof exports.TransformStream);
      assert.ok(transform.readable instanceof exports.ReadableStream);
    });
  });

  describe('on an implementation that is not complete enough to build on', () => {
    // A ReadableStream without byte streams
    class IncompleteReadableStream extends ReadableStream {
      constructor(source, strategy) {
        if (source?.type === 'bytes') {
          throw new RangeError('Byte streams are not supported');
        }
        super(source, strategy);
      }
    }
    const exports = loadExtendNative({
      ReadableStream: IncompleteReadableStream,
      WritableStream,
      TransformStream,
      AbortSignal
    });

    it('exports its own implementation', () => {
      assert.notEqual(Object.getPrototypeOf(exports.ReadableStream), IncompleteReadableStream);
      assert.notEqual(Object.getPrototypeOf(exports.WritableStream), WritableStream);
      new exports.ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
    });

    it('cannot adopt native streams', () => {
      const stream = new exports.ReadableStream();
      assert.equal(exports.adopt(stream), stream);
      assert.throws(() => exports.adopt(new IncompleteReadableStream()), { name: 'TypeError' });
    });
  });

  it('exports its own implementation without native streams', () => {
    const exports = loadExtendNative({});
    for (const name of ['ReadableStream', 'WritableStream', 'TransformStream', 'ByteLengthQueuingStrategy']) {
      assert.equal(typeof exports[name], 'function', name);
    }
    assert.equal(typeof exports.adopt, 'function');
  });
});
