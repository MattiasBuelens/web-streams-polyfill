import assert from '../stub/assert';

const CHUNK_SIZE = 16384;

/**
 * Simple queue structure.
 *
 * Avoids scalability issues with large arrays in Chrome
 * by using an array of bounded arrays instead.
 *
 * @see https://github.com/MattiasBuelens/web-streams-polyfill/issues/15
 */
export class SimpleQueue<T> {
  private readonly _chunks: T[][];
  private _front: T[];
  private _back: T[];
  private _size: number = 0;

  constructor() {
    const chunk: T[] = [];
    this._chunks = [chunk];
    this._front = chunk;
    this._back = chunk;
    this._size = 0;
  }

  get length(): number {
    return this._size;
  }

  push(element: T): void {
    this._back.push(element);
    ++this._size;

    if (this._back.length === CHUNK_SIZE) {
      this._back = [];
      this._chunks.push(this._back);
    }
  }

  shift(): T {
    assert(this._size > 0); // must not be called on an empty queue

    const element = this._front.shift()!;
    --this._size;

    if (this._front.length === 0 && this._front !== this._back) {
      this._chunks.shift();
      this._front = this._chunks[0];
    }

    return element;
  }

  peek(): T {
    assert(this._size > 0); // must not be called on an empty queue

    return this._front[0];
  }

}
