import { assertDictionary } from './basic';
import {
  ReadableStreamIteratorOptions,
  ValidatedReadableStreamIteratorOptions
} from '../readable-stream/iterator-options';

export function convertIteratorOptions(options: ReadableStreamIteratorOptions | undefined,
                                       context: string): ValidatedReadableStreamIteratorOptions {
  assertDictionary(options, context);
  const preventCancel = options?.preventCancel;
  return { preventCancel: Boolean(preventCancel) };
}
