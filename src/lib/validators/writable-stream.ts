import type { WritableStream } from '../writable-stream';
import { IsWritableStream } from '../writable-stream';
import type { WritableStreamLike } from '../helpers/stream-like';
import { IsWritableStreamLike } from '../helpers/stream-like';

export function assertWritableStream(x: unknown, context: string): asserts x is WritableStream {
  if (!IsWritableStream(x)) {
    throw new TypeError(`${context} is not a WritableStream.`);
  }
}

export function assertWritableStreamLike(x: unknown, context: string): asserts x is WritableStreamLike {
  if (!IsWritableStreamLike(x)) {
    throw new TypeError(`${context} is not a WritableStream.`);
  }
}
