import type { ReadableStream } from '../readable-stream';
import { IsReadableStream } from '../readable-stream';

export function assertReadableStream(x: unknown, context: string): asserts x is ReadableStream {
  if (!IsReadableStream(x)) {
    throw new TypeError(`${context} is not a ReadableStream.`);
  }
}
