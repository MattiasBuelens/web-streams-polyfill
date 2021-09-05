import { assertDictionary, assertRequiredField } from './basic';
import { ReadableStream } from '../readable-stream';
import { WritableStream } from '../writable-stream';
import { assertReadableStream } from './readable-stream';
import { assertWritableStream } from './writable-stream';

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
