import { assertDictionary } from './basic';
import { ReadableStreamGetReaderOptions } from '../readable-stream/reader-options';

export function convertReaderOptions(options: ReadableStreamGetReaderOptions | null | undefined,
                                     context: string): ReadableStreamGetReaderOptions {
  assertDictionary(options, context);
  const mode = options?.mode;
  return {
    mode: mode === undefined ? undefined : convertReadableStreamReaderMode(mode, `${context} has member 'mode' that`)
  };
}

function convertReadableStreamReaderMode(mode: string, context: string): 'byob' {
  mode = `${mode}`;
  if (mode !== 'byob') {
    throw new TypeError(`${context} '${mode}' is not a valid enumeration value for ReadableStreamReaderMode`);
  }
  return mode;
}
