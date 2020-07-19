import { IsWritableStream, WritableStream } from '../writable-stream';

export function assertWritableStream(x: unknown, context: string): asserts x is WritableStream {
  if (!IsWritableStream(x)) {
    throw new TypeError(`${context} is not a WritableStream.`);
  }
}
