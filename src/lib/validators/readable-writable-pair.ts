import { assertDictionary, assertRequiredField } from './basic';
import type { ReadableStreamLike, WritableStreamLike } from '../helpers/stream-like';
import { assertReadableStreamLike } from './readable-stream';
import { assertWritableStreamLike } from './writable-stream';

export function convertReadableWritablePair<RS extends ReadableStreamLike, WS extends WritableStreamLike>(
  pair: { readable: RS; writable: WS } | null | undefined,
  context: string
): { readable: RS; writable: WS } {
  assertDictionary(pair, context);

  const readable = pair?.readable;
  assertRequiredField(readable, 'readable', 'ReadableWritablePair');
  assertReadableStreamLike(readable, `${context} has member 'readable' that`);

  const writable = pair?.writable;
  assertRequiredField(writable, 'writable', 'ReadableWritablePair');
  assertWritableStreamLike(writable, `${context} has member 'writable' that`);

  return { readable, writable };
}
