/**
 * Options for {@link ReadableStream.(getReader:2)}.
 *
 * @public
 */
export interface ReadableStreamGetReaderOptions {
  mode?: 'byob';
}

/**
 * Options for {@link ReadableStreamBYOBReader.read | reading} a stream
 * with a {@link ReadableStreamBYOBReader | BYOB reader}.
 *
 * @public
 */
export interface ReadableStreamBYOBReaderReadOptions {
  min?: number;
}

export type ValidatedReadableStreamBYOBReaderReadOptions = Required<ReadableStreamBYOBReaderReadOptions>;
