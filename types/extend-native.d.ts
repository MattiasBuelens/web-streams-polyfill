import type { ReadableStream, TransformStream, WritableStream } from './ponyfill.js';

export * from './ponyfill.js';

/**
 * The chunk type of a (native) `WritableStream`.
 *
 * @public
 */
export type WritableStreamChunk<S> = S extends { getWriter(): { write(chunk?: infer W): any } } ? W : any;

/**
 * The chunk type of a (native) `ReadableStream`.
 *
 * @public
 */
export type ReadableStreamChunk<S> = S extends { pipeTo(destination: infer D, ...args: any[]): any }
  ? WritableStreamChunk<D>
  : any;

/**
 * Converts a native stream (e.g. `Response.body`, or a `CompressionStream`) into a stream of this module, in place:
 * it changes the stream's prototype, and returns the same object.
 * Streams that are already streams of this module are returned as-is.
 * So are instances of other subclasses of the native classes (e.g. a `FileSystemWritableFileStream`),
 * since changing their prototype would lose that subclass's own members.
 * They still work as native streams, but don't get the features that this module adds.
 *
 * Streams that this module's own methods return, such as the branches of `tee()`
 * or the result of `pipeThrough()`, are converted automatically.
 *
 * Throws a `TypeError` if the given object is not a native stream.
 * Also throws if the native streams implementation could not be extended,
 * in which case this module exports its own implementation instead.
 *
 * @public
 */
export declare function adopt<S extends { readonly readable: object; readonly writable: object }>(
  stream: S
): TransformStream<WritableStreamChunk<S['writable']>, ReadableStreamChunk<S['readable']>>;
export declare function adopt<S extends { readonly locked: boolean; getReader(): object }>(
  stream: S
): ReadableStream<ReadableStreamChunk<S>>;
export declare function adopt<S extends { readonly locked: boolean; getWriter(): object }>(
  stream: S
): WritableStream<WritableStreamChunk<S>>;
