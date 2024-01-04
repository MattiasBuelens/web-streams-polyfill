import { typeIsObject } from '../helpers/miscellaneous';
import type { ReadableStreamDefaultReadResult } from './default-reader';

/**
 * A common interface for a `ReadadableStream` implementation.
 *
 * @public
 */
export interface ReadableStreamLike<R = any> {
  readonly locked: boolean;

  getReader(): ReadableStreamDefaultReaderLike<R>;
}

/**
 * A common interface for a `ReadableStreamDefaultReader` implementation.
 *
 * @public
 */
export interface ReadableStreamDefaultReaderLike<R = any> {
  readonly closed: Promise<undefined>;

  cancel(reason?: any): Promise<void>;

  read(): Promise<ReadableStreamDefaultReadResult<R>>;

  releaseLock(): void;
}

export function isReadableStreamLike<R>(stream: unknown): stream is ReadableStreamLike<R> {
  return typeIsObject(stream) && typeof (stream as ReadableStreamLike<R>).getReader !== 'undefined';
}
