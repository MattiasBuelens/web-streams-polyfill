import type { WritableStream } from '../writable-stream';
import { IsWritableStream } from '../writable-stream';

export function assertWritableStream(x: unknown, context: string): asserts x is WritableStream {
  if (!IsWritableStream(x)) {
    throw new TypeError(`${context} is not a WritableStream.`);
  }
}
