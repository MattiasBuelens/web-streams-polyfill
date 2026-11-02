const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReadableStream } = require('web-streams-polyfill');

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('ReadableStream async iterator', () => {
  it('handles next() called reentrantly from pull() during a buffered read', async () => {
    let iterator;
    let second;
    const rs = new ReadableStream({
      start(c) {
        c.enqueue('first');
      },
      pull(c) {
        c.enqueue('second');
        second = iterator.next();
        c.close();
      }
    });
    iterator = rs.values();
    await flush();
    const first = iterator.next();
    assert.ok(first instanceof Promise);
    assert.deepEqual(await Promise.all([first, second]), [
      { value: 'first', done: false },
      { value: 'second', done: false }
    ]);
    assert.deepEqual(await iterator.next(), { value: undefined, done: true });
  });

  it('delivers a buffered chunk in a microtask', async () => {
    const iterator = new ReadableStream({
      start(c) {
        c.enqueue(1);
        c.close();
      }
    }).values();
    const events = [];
    const next = iterator.next().then(() => events.push('next'));
    queueMicrotask(() => events.push('microtask'));
    await next;
    await flush();
    assert.deepEqual(events, ['microtask', 'next']);
  });

  it('delivers a pulled chunk in a microtask', async () => {
    let controller;
    const iterator = new ReadableStream({
      start(c) {
        controller = c;
      }
    }).values();
    const events = [];
    const next = iterator.next().then(() => events.push('next'));
    await flush();
    controller.enqueue(1);
    queueMicrotask(() => events.push('microtask'));
    await next;
    assert.deepEqual(events, ['microtask', 'next']);
  });
});
