const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TransformStream } = require('web-streams-polyfill');

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('TransformStream cancel', () => {
  // https://github.com/nodejs/node/issues/62036
  it('does not run a write released by a read that is cancelled in the same turn', async () => {
    const transformed = [];
    const ts = new TransformStream({
      transform(chunk, controller) {
        transformed.push(chunk);
        controller.enqueue(chunk);
      }
    });
    const writer = ts.writable.getWriter();
    const reader = ts.readable.getReader();
    await flush();
    const write = writer.write('a');
    const read = reader.read();
    const cancel = reader.cancel('stop');
    assert.equal(await write, undefined);
    assert.deepEqual(await read, { value: undefined, done: true });
    await cancel;
    await assert.rejects(writer.closed, reason => reason === 'stop');
    assert.deepEqual(transformed, []);
  });
});
