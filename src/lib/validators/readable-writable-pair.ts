import { assertDictionary, assertRequiredField } from './basic';
import { ReadableWritablePair } from '../readable-stream/readable-writable-pair';
import { assertReadableStream } from './readable-stream';
import { assertWritableStream } from './writable-stream';

export function convertReadableWritablePair<R, W>(pair: ReadableWritablePair<R, W> | null | undefined,
                                                  context: string): ReadableWritablePair<R, W> {
  assertDictionary(pair, context);

  const readable = pair?.readable;
  assertRequiredField(readable, 'readable', 'ReadableWritablePair');
  assertReadableStream(readable, `${context} has member 'readable' that`);

  const writable = pair?.writable;
  assertRequiredField(writable, 'writable', 'ReadableWritablePair');
  assertWritableStream(writable, `${context} has member 'writable' that`);

  return { readable, writable };
}
