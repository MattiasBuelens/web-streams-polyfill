import { IsReadableStream, ReadableStream } from '../readable-stream';

export function assertReadableStream(x: unknown, context: string): asserts x is ReadableStream {
  if (!IsReadableStream(x)) {
    throw new TypeError(`${context} is not a ReadableStream.`);
  }
}
