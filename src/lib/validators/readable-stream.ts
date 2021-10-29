import type { ReadableStream } from '../readable-stream';
import { IsReadableStream } from '../readable-stream';
import type { ReadableStreamLike } from '../helpers/stream-like';
import { IsReadableStreamLike } from '../helpers/stream-like';

export function assertReadableStream(x: unknown, context: string): asserts x is ReadableStream {
  if (!IsReadableStream(x)) {
    throw new TypeError(`${context} is not a ReadableStream.`);
  }
}

export function assertReadableStreamLike(x: unknown, context: string): asserts x is ReadableStreamLike {
  if (!IsReadableStreamLike(x)) {
    throw new TypeError(`${context} is not a ReadableStream.`);
  }
}
