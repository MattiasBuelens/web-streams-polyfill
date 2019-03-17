import assert from '../stub/assert';

// Original from Chromium
// https://chromium.googlesource.com/chromium/src/+/0aee4434a4dba42a42abaea9bfbc0cd196a63bc1/third_party/blink/renderer/core/streams/SimpleQueue.js

const QUEUE_MAX_ARRAY_SIZE = 16384;

interface Node<T> {
  _elements: T[];
  _next: Node<T> | undefined;
}

/**
 * Simple queue structure.
 *
 * Avoids scalability issues with using a packed array directly by using
 * multiple arrays in a linked list and keeping the array size bounded.
 */
export class SimpleQueue<T> {
  private _front: Node<T>;
  private _back: Node<T>;
  private _cursor: number = 0;
  private _size: number = 0;

  constructor() {
    // _front and _back are always defined.
    this._front = {
      _elements: [],
      _next: undefined
    };
    this._back = this._front;
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
  peek() {
    assert(this._size > 0); // must not be called on an empty queue

    const front = this._front;
    const cursor = this._cursor;
    return front._elements[cursor];
  }
}
