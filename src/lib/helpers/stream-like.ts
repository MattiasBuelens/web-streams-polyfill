import { typeIsObject } from './miscellaneous';
import assert from '../../stub/assert';
import type { ReadableStreamBYOBReadResult, ReadableStreamDefaultReadResult } from '../readable-stream';

// For methods like ReadableStream.pipeTo() or .tee(), we want the polyfill's implementation to be compatible
// with *any* streams implementation, including native streams or a different polyfill.
// These types define the minimal API that the polyfill *may* expect from such implementations.
// Importantly, these do not have any internal fields and cannot be used by the internal abstract ops,
// so the polyfill can *only* use their public API.

export interface ReadableStreamLike<R = any> {
  readonly locked: boolean;

  getReader(): ReadableStreamDefaultReaderLike<R>;
}

export interface ReadableByteStreamLike extends ReadableStreamLike<Uint8Array> {
  getReader({ mode }: { mode: 'byob' }): ReadableStreamBYOBReaderLike;

  getReader(): ReadableStreamDefaultReaderLike<Uint8Array>;
}

export interface ReadableStreamDefaultReaderLike<R = any> {
  readonly closed: Promise<void>;

  cancel(reason?: any): Promise<void>;

  read(): Promise<ReadableStreamDefaultReadResult<R>>;

  releaseLock(): void;
}

export interface ReadableStreamBYOBReaderLike {
  readonly closed: Promise<void>;

  cancel(reason?: any): Promise<void>;

  read<T extends ArrayBufferView>(view: T): Promise<ReadableStreamBYOBReadResult<T>>;

  releaseLock(): void;
}

export type ReadableStreamReaderLike<R = any> = ReadableStreamDefaultReaderLike<R> | ReadableStreamBYOBReaderLike;

export interface WritableStreamLike<W = any> {
  readonly locked: boolean;

  getWriter(): WritableStreamDefaultWriterLike<W>;
}

interface WritableStreamDefaultWriterLike<W = any> {
  readonly closed: Promise<undefined>;
  readonly desiredSize: number | null;
  readonly ready: Promise<undefined>;

  abort(reason?: any): Promise<void>;

  close(): Promise<void>;

  releaseLock(): void;

  write(chunk: W): Promise<void>;
}

export function IsReadableStreamLike(x: unknown): x is ReadableStreamLike {
  if (!typeIsObject(x)) {
    return false;
  }
  if (typeof (x as ReadableStreamLike).getReader !== 'function') {
    return false;
  }
  try {
    // noinspection SuspiciousTypeOfGuard
    return typeof (x as ReadableStreamLike).locked === 'boolean';
  } catch {
    // ReadableStream.prototype.locked may throw if its brand check fails
    return false;
  }
}

export function IsReadableByteStreamLike(x: ReadableStreamLike): x is ReadableByteStreamLike {
  assert(IsReadableStreamLike(x));

  // This brand check only works for unlocked streams.
  // If the stream is locked, getReader() will throw even if "byob" is actually supported.
  assert(!x.locked);

  try {
    (x as ReadableByteStreamLike).getReader({ mode: 'byob' }).releaseLock();
    return true;
  } catch {
    // getReader() throws if mode is not supported
    return false;
  }
}

export function IsWritableStreamLike(x: unknown): x is WritableStreamLike {
  if (!typeIsObject(x)) {
    return false;
  }
  if (typeof (x as WritableStreamLike).getWriter !== 'function') {
    return false;
  }
  try {
    // noinspection SuspiciousTypeOfGuard
    return typeof (x as WritableStreamLike).locked === 'boolean';
  } catch {
    // WritableStream.prototype.locked may throw if its brand check fails
    return false;
  }
}
