import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check, install } from 'web-streams-polyfill/feature/byob-read-min';

/**
 * Node.js already supports read(view, { min }), so make the native read() ignore its options.
 * This changes the global ReadableStreamBYOBReader.prototype, like the feature itself does.
 */
function hideNativeMin() {
  const prototype = ReadableStreamBYOBReader.prototype;
  const nativeRead = prototype.read;
  Object.defineProperty(prototype, 'read', {
    value: {
      read(view) {
        return nativeRead.call(this, view);
      }
    }.read
  });
}

function createStream() {
  let controller;
  const stream = new ReadableStream({
    type: 'bytes',
    start(c) {
      controller = c;
    }
  });
  return { stream, controller };
}

describe('byob-read-min feature', () => {
  before(() => {
    assert.equal(check(), true);
    hideNativeMin();
    assert.equal(check(), false);
    assert.equal(install(), true);
    assert.equal(check(), true);
  });

  it('fills at least min elements', async () => {
    const { stream, controller } = createStream();
    const reader = stream.getReader({ mode: 'byob' });
    const read = reader.read(new Uint16Array(4), { min: 3 });
    controller.enqueue(new Uint8Array([1, 0]));
    controller.enqueue(new Uint8Array([2, 0, 3]));
    controller.enqueue(new Uint8Array([0]));
    const { done, value } = await read;
    assert.equal(done, false);
    assert.ok(value instanceof Uint16Array);
    assert.deepEqual([...value], [1, 2, 3]);
    assert.equal(value.byteOffset, 0);
    assert.equal(value.buffer.byteLength, 8);
  });

  it('completes later reads in order', async () => {
    const { stream, controller } = createStream();
    const reader = stream.getReader({ mode: 'byob' });
    const order = [];
    const first = reader.read(new Uint8Array(3), { min: 3 }).then(result => {
      order.push('first');
      return result;
    });
    const second = reader.read(new Uint8Array(1)).then(result => {
      order.push('second');
      return result;
    });
    controller.enqueue(new Uint8Array([1, 2]));
    controller.enqueue(new Uint8Array([3, 4]));
    assert.deepEqual([...(await first).value], [1, 2, 3]);
    assert.deepEqual([...(await second).value], [4]);
    assert.deepEqual(order, ['first', 'second']);
  });

  it('returns the filled part when the stream closes', async () => {
    const { stream, controller } = createStream();
    const reader = stream.getReader({ mode: 'byob' });
    const read = reader.read(new Uint8Array(4), { min: 4 });
    controller.enqueue(new Uint8Array([1, 2]));
    await Promise.resolve();
    controller.close();
    const { done, value } = await read;
    assert.equal(done, true);
    assert.deepEqual([...value], [1, 2]);
    assert.equal(value.buffer.byteLength, 4);
  });

  it('returns undefined when the stream is cancelled', async () => {
    const { stream, controller } = createStream();
    const reader = stream.getReader({ mode: 'byob' });
    const read = reader.read(new Uint8Array(4), { min: 4 });
    controller.enqueue(new Uint8Array([1, 2]));
    await Promise.resolve();
    await reader.cancel();
    assert.deepEqual(await read, { done: true, value: undefined });
  });

  it('validates min', async () => {
    const { stream } = createStream();
    const reader = stream.getReader({ mode: 'byob' });
    await assert.rejects(reader.read(new Uint8Array(1), { min: 0 }), TypeError);
    await assert.rejects(reader.read(new Uint8Array(1), { min: 2 }), RangeError);
    await assert.rejects(reader.read(new Uint8Array(1), { min: -1 }), TypeError);
  });
});
