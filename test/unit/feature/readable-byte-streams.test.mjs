import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check, install } from 'web-streams-polyfill/feature/readable-byte-streams';

const NativeReadableStream = globalThis.ReadableStream;

/**
 * Node.js already supports byte streams, so subclass its ReadableStream into one without byte streams
 * (like Safari before 26.4).
 */
function createClasses() {
  class ReadableStreamWithoutBytes extends NativeReadableStream {
    constructor(source = undefined, strategy = undefined) {
      if (source !== null && typeof source === 'object' && source.type === 'bytes') {
        throw new RangeError('Byte streams are not supported');
      }
      super(source, strategy);
    }

    getReader(options = undefined) {
      if (options !== undefined && options !== null && options.mode !== undefined) {
        throw new TypeError('Unsupported reader mode');
      }
      return super.getReader();
    }
  }
  return {
    ReadableStream: ReadableStreamWithoutBytes,
    WritableStream: globalThis.WritableStream,
    TransformStream: globalThis.TransformStream
  };
}

function installed() {
  const classes = createClasses();
  assert.equal(install(classes), true);
  return classes;
}

async function readAll(reader) {
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }
    chunks.push(...value);
  }
}

describe('readable-byte-streams feature', () => {
  it('installs on a ReadableStream without byte streams', () => {
    const classes = createClasses();
    const prototype = classes.ReadableStream.prototype;
    assert.equal(check(classes), false);
    assert.equal(install(classes), true);
    assert.equal(check(classes), true);
    assert.equal(install(classes), false);

    // The new constructor shares the native prototype.
    assert.equal(classes.ReadableStream.prototype, prototype);
    assert.equal(prototype.constructor, classes.ReadableStream);
    for (const name of ['ReadableByteStreamController', 'ReadableStreamBYOBReader', 'ReadableStreamBYOBRequest']) {
      assert.equal(typeof classes[name], 'function', name);
    }
  });

  it('does not install on a ReadableStream with byte streams', () => {
    const classes = { ReadableStream: NativeReadableStream };
    assert.equal(check(classes), true);
    assert.equal(install(classes), false);
    assert.equal(classes.ReadableStream, NativeReadableStream);
  });

  it('creates native streams', async () => {
    const { ReadableStream } = installed();
    const defaultStream = new ReadableStream({
      start(c) {
        c.enqueue('a');
        c.close();
      }
    });
    const byteStream = new ReadableStream({
      type: 'bytes',
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.close();
      }
    });
    for (const stream of [defaultStream, byteStream]) {
      assert.ok(stream instanceof ReadableStream);
      assert.ok(stream instanceof NativeReadableStream);
    }
    // A byte stream can be consumed by the platform, since it's a native stream.
    assert.deepEqual([...new Uint8Array(await new Response(byteStream).arrayBuffer())], [1, 2, 3]);
  });

  it('reads a byte stream with a BYOB reader', async () => {
    const { ReadableStream, ReadableStreamBYOBReader, ReadableStreamBYOBRequest } = installed();
    let byobRequest;
    const stream = new ReadableStream({
      type: 'bytes',
      pull(c) {
        byobRequest = c.byobRequest;
        const view = byobRequest.view;
        view[0] = 1;
        view[1] = 2;
        byobRequest.respond(2);
      }
    });
    const reader = stream.getReader({ mode: 'byob' });
    assert.ok(reader instanceof ReadableStreamBYOBReader);
    assert.equal(stream.locked, true);

    const { done, value } = await reader.read(new Uint8Array(4));
    assert.equal(done, false);
    assert.deepEqual([...value], [1, 2]);
    assert.ok(byobRequest instanceof ReadableStreamBYOBRequest);

    const { value: minValue } = await reader.read(new Uint8Array(4), { min: 4 });
    assert.deepEqual([...minValue], [1, 2, 1, 2]);

    reader.releaseLock();
    assert.equal(stream.locked, false);
  });

  it('reads a byte stream with a default reader', async () => {
    const { ReadableStream } = installed();
    let pulls = 0;
    const stream = new ReadableStream({
      type: 'bytes',
      autoAllocateChunkSize: 2,
      pull(c) {
        pulls++;
        if (pulls > 3) {
          c.close();
          c.byobRequest.respond(0);
          return;
        }
        c.byobRequest.view[0] = pulls;
        c.byobRequest.respond(1);
      }
    });
    assert.deepEqual(await readAll(stream.getReader()), [1, 2, 3]);
  });

  it('switches between BYOB and default readers', async () => {
    const { ReadableStream } = installed();
    const stream = new ReadableStream({
      type: 'bytes',
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3, 4]));
        c.close();
      }
    });
    const byobReader = stream.getReader({ mode: 'byob' });
    const { value } = await byobReader.read(new Uint8Array(1));
    assert.deepEqual([...value], [1]);
    byobReader.releaseLock();
    assert.deepEqual(await readAll(stream.getReader()), [2, 3, 4]);
  });

  // node:test has no it.each(), so generate one test per reader mode.
  for (const mode of ['byob', undefined]) {
    it(`keeps chunks for the next reader after releasing a reader with a pending read (next reader: ${mode ?? 'default'})`, async () => {
      const { ReadableStream } = installed();
      let controller;
      const stream = new ReadableStream({
        type: 'bytes',
        start(c) {
          controller = c;
        }
      });
      const reader = stream.getReader();
      const read = reader.read();
      await new Promise(resolve => setTimeout(resolve, 0));
      reader.releaseLock();
      await assert.rejects(read, TypeError);
      // Nobody is reading now, so this chunk must stay in our byte stream's queue (not in the native stream's queue).
      controller.enqueue(new Uint8Array([1, 2]));
      const nextReader = stream.getReader({ mode });
      const { value } = mode === 'byob' ? await nextReader.read(new Uint8Array(2)) : await nextReader.read();
      assert.deepEqual([...value], [1, 2]);
    });
  }

  it('tees a byte stream into two byte streams', async () => {
    const { ReadableStream } = installed();
    const stream = new ReadableStream({
      type: 'bytes',
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.close();
      }
    });
    const [branch1, branch2] = stream.tee();
    assert.ok(branch1 instanceof ReadableStream);
    const { value } = await branch1.getReader({ mode: 'byob' }).read(new Uint8Array(2));
    assert.deepEqual([...value], [1, 2]);
    assert.deepEqual(await readAll(branch2.getReader()), [1, 2]);
  });

  it('cancels and errors a byte stream', async () => {
    const { ReadableStream } = installed();
    let cancelReason;
    const cancelled = new ReadableStream({
      type: 'bytes',
      cancel(reason) {
        cancelReason = reason;
      }
    });
    await cancelled.cancel('reason');
    assert.equal(cancelReason, 'reason');

    const error = new Error('boom');
    const errored = new ReadableStream({
      type: 'bytes',
      start(c) {
        c.error(error);
      }
    });
    const reader = errored.getReader();
    await assert.rejects(reader.read(), error);
    reader.releaseLock();
    await assert.rejects(errored.getReader({ mode: 'byob' }).read(new Uint8Array(1)), error);
  });

  it('pipes a byte stream', async () => {
    const { ReadableStream } = installed();
    const stream = new ReadableStream({
      type: 'bytes',
      start(c) {
        c.enqueue(new Uint8Array([1]));
        c.enqueue(new Uint8Array([2]));
        c.close();
      }
    });
    const chunks = [];
    await stream.pipeTo(new WritableStream({
      write(chunk) {
        chunks.push(...chunk);
      }
    }));
    assert.deepEqual(chunks, [1, 2]);
  });

  it('rejects a BYOB reader for a default stream', () => {
    const { ReadableStream } = installed();
    assert.throws(() => new ReadableStream().getReader({ mode: 'byob' }), TypeError);
    assert.throws(() => new ReadableStream().getReader({ mode: 'invalid' }), TypeError);
  });

  it('reads each source member once', () => {
    const { ReadableStream } = installed();
    const gets = [];
    const source = new Proxy({ type: 'bytes', pull() {} }, {
      get(target, key, receiver) {
        gets.push(key);
        return Reflect.get(target, key, receiver);
      }
    });
    new ReadableStream(source);
    assert.deepEqual(gets.toSorted(), ['autoAllocateChunkSize', 'cancel', 'pull', 'start', 'type']);
  });

  // This replaces the constructor of Node's own ReadableStreamDefaultReader, so it runs last.
  it('counts the reads of readers from new ReadableStreamDefaultReader()', async () => {
    const classes = createClasses();
    const NativeReader = globalThis.ReadableStreamDefaultReader;
    classes.ReadableStreamDefaultReader = NativeReader;
    assert.equal(install(classes), true);
    const { ReadableStream, ReadableStreamDefaultReader } = classes;
    assert.notEqual(ReadableStreamDefaultReader, NativeReader);
    assert.equal(ReadableStreamDefaultReader.prototype, NativeReader.prototype);
    assert.equal(ReadableStreamDefaultReader.length, 1);
    assert.throws(() => ReadableStreamDefaultReader(new ReadableStream()), TypeError);
    assert.throws(() => new ReadableStreamDefaultReader({}), TypeError);

    let controller;
    const stream = new ReadableStream({
      type: 'bytes',
      start(c) {
        controller = c;
      }
    });
    const reader = new ReadableStreamDefaultReader(stream);
    assert.ok(reader instanceof ReadableStreamDefaultReader);
    const read = reader.read();
    await new Promise(resolve => setTimeout(resolve, 0));
    reader.releaseLock();
    await assert.rejects(read, TypeError);
    controller.enqueue(new Uint8Array([1, 2]));
    const { value } = await stream.getReader({ mode: 'byob' }).read(new Uint8Array(2));
    assert.deepEqual([...value], [1, 2]);
  });
});
