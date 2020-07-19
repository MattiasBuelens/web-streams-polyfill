export interface ReadableStreamIteratorOptions {
  preventCancel?: boolean;
}

export type ValidatedReadableStreamIteratorOptions = Required<ReadableStreamIteratorOptions>;
