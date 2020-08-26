/**
 * Options for {@link ReadableStream.values | async iterating} a stream.
 *
 * @public
 */
export interface ReadableStreamIteratorOptions {
  preventCancel?: boolean;
}

export type ValidatedReadableStreamIteratorOptions = Required<ReadableStreamIteratorOptions>;
