import assert from '../stub/assert.ts';

// Original from Chromium
// https://chromium.googlesource.com/chromium/src/+/0aee4434a4dba42a42abaea9bfbc0cd196a63bc1/third_party/blink/renderer/core/streams/SimpleQueue.js

const QUEUE_MAX_ARRAY_SIZE = 16384;

interface Node<T> {
  _elements: T[];
  _next: Node<T> | undefined;
}

// Optimization: a new queue starts out with this shared empty node, and only allocates its own node on the first
// push. Many queues (such as a stream's read requests or write requests) stay empty for their whole lifetime.
// This node is never mutated: push() replaces it before adding any element.
const EMPTY_NODE: Node<any> = {
  _elements: [],
  _next: undefined
};

/**
 * Simple queue structure.
 *
 * Avoids scalability issues with using a packed array directly by using
 * multiple arrays in a linked list and keeping the array size bounded.
 */
export class SimpleQueue<T> {
  private _front: Node<T>;
  private _back: Node<T>;
  private _cursor = 0;
  private _size = 0;

  constructor() {
    // _front and _back are always defined.
    this._front = EMPTY_NODE;
    this._back = EMPTY_NODE;
    // The cursor is used to avoid calling Array.shift().
    // It contains the index of the front element of the array inside the
    // front-most node. It is always in the range [0, QUEUE_MAX_ARRAY_SIZE).
    this._cursor = 0;
    // When there is only one node, size === elements.length - cursor.
    this._size = 0;
  }

  get length(): number {
    return this._size;
  }

  // For exception safety, this method is structured in order:
  // 1. Read state
  // 2. Calculate required state mutations
  // 3. Perform state mutations
  push(element: T): void {
    if (this._back === EMPTY_NODE) {
      assert(this._size === 0);
      const node: Node<T> = {
        _elements: [element],
        _next: undefined
      };
      this._front = node;
      this._back = node;
      this._cursor = 0;
      this._size = 1;
      return;
    }

    const oldBack = this._back;
    let newBack = oldBack;
    assert(oldBack._next === undefined);
    if (oldBack._elements.length === QUEUE_MAX_ARRAY_SIZE - 1) {
      newBack = {
        _elements: [],
        _next: undefined
      };
    }

    // push() is the mutation most likely to throw an exception, so it
    // goes first.
    oldBack._elements.push(element);
    if (newBack !== oldBack) {
      this._back = newBack;
      oldBack._next = newBack;
    }
    ++this._size;
  }

  // Adds an element to the front of the queue, so the next shift() returns it.
  pushFront(element: T): void {
    if (this._front === EMPTY_NODE) {
      this.push(element);
      return;
    }

    const front = this._front;
    const cursor = this._cursor;
    if (cursor > 0) {
      // Reuse the slot of the last shifted element.
      front._elements[cursor - 1] = element;
      this._cursor = cursor - 1;
    } else if (front._elements.length < QUEUE_MAX_ARRAY_SIZE - 1) {
      // The front node is also the back node, and push() can still add to it after this.
      assert(front === this._back);
      front._elements.unshift(element);
    } else {
      // The front node is full: add a new full-sized front node, with only its last slot in use.
      const elements: T[] = new Array(QUEUE_MAX_ARRAY_SIZE);
      elements[QUEUE_MAX_ARRAY_SIZE - 1] = element;
      this._front = {
        _elements: elements,
        _next: front
      };
      this._cursor = QUEUE_MAX_ARRAY_SIZE - 1;
    }
    ++this._size;
  }

  // Like push(), shift() follows the read -> calculate -> mutate pattern for
  // exception safety.
  shift(): T {
    assert(this._size > 0); // must not be called on an empty queue

    const oldFront = this._front;
    let newFront = oldFront;
    const oldCursor = this._cursor;
    let newCursor = oldCursor + 1;

    const elements = oldFront._elements;
    const element = elements[oldCursor];

    if (newCursor === QUEUE_MAX_ARRAY_SIZE) {
      assert(elements.length === QUEUE_MAX_ARRAY_SIZE);
      assert(oldFront._next !== undefined);
      newFront = oldFront._next!;
      newCursor = 0;
    }

    // No mutations before this point.
    --this._size;
    this._cursor = newCursor;
    if (oldFront !== newFront) {
      this._front = newFront;
    }

    // Permit shifted element to be garbage collected.
    elements[oldCursor] = undefined!;

    return element;
  }

  // The tricky thing about forEach() is that it can be called
  // re-entrantly. The queue may be mutated inside the callback. It is easy to
  // see that push() within the callback has no negative effects since the end
  // of the queue is checked for on every iteration. If shift() is called
  // repeatedly within the callback then the next iteration may return an
  // element that has been removed. In this case the callback will be called
  // with undefined values until we either "catch up" with elements that still
  // exist or reach the back of the queue.
  forEach(callback: (element: T) => void): void {
    let i = this._cursor;
    let node = this._front;
    let elements = node._elements;
    while (i !== elements.length || node._next !== undefined) {
      if (i === elements.length) {
        assert(node._next !== undefined);
        assert(i === QUEUE_MAX_ARRAY_SIZE);
        node = node._next!;
        elements = node._elements;
        i = 0;
        if (elements.length === 0) {
          break;
        }
      }
      callback(elements[i]);
      ++i;
    }
  }

  // Return the element that would be returned if shift() was called now,
  // without modifying the queue.
  peek(): T {
    assert(this._size > 0); // must not be called on an empty queue

    const front = this._front;
    const cursor = this._cursor;
    return front._elements[cursor];
  }
}
