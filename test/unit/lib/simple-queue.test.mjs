import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the source directly (Node strips the types), with assertions enabled.
globalThis.DEBUG = true;
const { SimpleQueue } = await import('../../../src/lib/simple-queue.ts');

// Must match QUEUE_MAX_ARRAY_SIZE in simple-queue.ts.
const NODE_SIZE = 16384;

function toArray(queue) {
  const elements = [];
  queue.forEach(element => elements.push(element));
  return elements;
}

function assertQueue(queue, expected) {
  assert.equal(queue.length, expected.length);
  assert.deepEqual(toArray(queue), expected);
  if (expected.length > 0) {
    assert.equal(queue.peek(), expected[0]);
  }
}

/**
 * A small deterministic pseudo-random number generator, so failures are reproducible.
 */
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('SimpleQueue', () => {
  it('pushes and shifts in order', () => {
    const queue = new SimpleQueue();
    assertQueue(queue, []);
    queue.push(1);
    queue.push(2);
    queue.push(3);
    assertQueue(queue, [1, 2, 3]);
    assert.equal(queue.shift(), 1);
    assertQueue(queue, [2, 3]);
  });

  it('pushes to the front of an empty queue', () => {
    const queue = new SimpleQueue();
    queue.pushFront(1);
    assertQueue(queue, [1]);
    queue.push(2);
    assertQueue(queue, [1, 2]);
  });

  it('pushes to the front after shifting', () => {
    const queue = new SimpleQueue();
    queue.push(1);
    queue.push(2);
    assert.equal(queue.shift(), 1);
    queue.pushFront(0);
    queue.pushFront(-1);
    assertQueue(queue, [-1, 0, 2]);
  });

  it('pushes to the front of a full node', () => {
    const queue = new SimpleQueue();
    const expected = [];
    for (let i = 0; i < 2 * NODE_SIZE; i++) {
      queue.push(i);
      expected.push(i);
    }
    for (let i = 1; i <= 3; i++) {
      queue.pushFront(-i);
      expected.unshift(-i);
    }
    assertQueue(queue, expected);
    for (const element of expected) {
      assert.equal(queue.shift(), element);
    }
    assertQueue(queue, []);
  });

  // Start with queues around the size of a node, so the operations cross node boundaries.
  for (const initialSize of [0, 1, NODE_SIZE - 2, NODE_SIZE - 1, NODE_SIZE, NODE_SIZE + 1, 2 * NODE_SIZE + 5]) {
    it(`matches an array for random operations (initial size: ${initialSize})`, () => {
      const random = createRandom(initialSize + 1);
      const queue = new SimpleQueue();
      const expected = [];
      let next = 0;
      for (let i = 0; i < initialSize; i++) {
        queue.push(next);
        expected.push(next++);
      }
      for (let step = 0; step < 2 * NODE_SIZE; step++) {
        const r = random();
        if (r < 0.4) {
          queue.push(next);
          expected.push(next++);
        } else if (r < 0.7) {
          queue.pushFront(next);
          expected.unshift(next++);
        } else if (expected.length > 0) {
          assert.equal(queue.shift(), expected.shift());
        }
        if (step % 1000 === 0) {
          assertQueue(queue, expected);
        }
      }
      assertQueue(queue, expected);
      while (expected.length > 0) {
        assert.equal(queue.shift(), expected.shift());
      }
      assertQueue(queue, []);
    });
  }
});
