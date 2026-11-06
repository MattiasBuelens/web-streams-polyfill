import { assertDictionary, assertRequiredField } from './basic.ts';
import { ReadableStream } from '../readable-stream.ts';
import { WritableStream } from '../writable-stream.ts';
import { assertReadableStream } from './readable-stream.ts';
import { assertWritableStream } from './writable-stream.ts';

export function convertReadableWritablePair<RS extends ReadableStream, WS extends WritableStream>(
  pair: { readable: RS; writable: WS } | null | undefined,
  context: string
): { readable: RS; writable: WS } {
  assertDictionary(pair, context);

  const readable = pair?.readable;
  assertRequiredField(readable, 'readable', 'ReadableWritablePair');
  assertReadableStream(readable, `${context} has member 'readable' that`);

  const writable = pair?.writable;
  assertRequiredField(writable, 'writable', 'ReadableWritablePair');
  assertWritableStream(writable, `${context} has member 'writable' that`);

  return { readable, writable };
}
