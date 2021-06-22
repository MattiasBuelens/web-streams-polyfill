import { ReadableStreamDefaultController } from './default-controller';
import { ReadableByteStreamController } from './byte-stream-controller';

export type ReadableStreamController<R = any> =
  ReadableStreamDefaultController<R> | ReadableByteStreamController;
export type UnderlyingDefaultOrByteSourceStartCallback<R> =
  (controller: ReadableStreamController<R>) => void | PromiseLike<void>;
export type UnderlyingDefaultOrByteSourcePullCallback<R> =
  (controller: ReadableStreamController<R>) => void | PromiseLike<void>;

/** @public */
export type UnderlyingSourceStartCallback<R> =
  (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
/** @public */
export type UnderlyingSourcePullCallback<R> =
  (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
/** @public */
export type UnderlyingByteSourceStartCallback =
  (controller: ReadableByteStreamController) => void | PromiseLike<void>;
/** @public */
export type UnderlyingByteSourcePullCallback =
  (controller: ReadableByteStreamController) => void | PromiseLike<void>;
/** @public */
export type UnderlyingSourceCancelCallback =
  (reason: any) => void | PromiseLike<void>;

export type ReadableStreamType = 'bytes';

/**
 * An underlying source for constructing a {@link ReadableStream}.
 *
 * @public
 */
export interface UnderlyingSource<R = any> {
  /**
   * A function that is called immediately during creation of the {@link ReadableStream}.
   */
  start?: UnderlyingSourceStartCallback<R>;
  /**
   * A function that is called whenever the stream’s internal queue of chunks becomes not full,
   * i.e. whenever the queue’s desired size becomes positive. Generally, it will be called repeatedly
   * until the queue reaches its high water mark (i.e. until the desired size becomes non-positive).
   */
  pull?: UnderlyingSourcePullCallback<R>;
  /**
   * A function that is called whenever the consumer cancels the stream, via
   * {@link ReadableStream.cancel | stream.cancel()},
   * {@link ReadableStreamDefaultReader.cancel | defaultReader.cancel()}, or
   * {@link ReadableStreamBYOBReader.cancel | byobReader.cancel()}.
   * It takes as its argument the same value as was passed to those methods by the consumer.
   */
  cancel?: UnderlyingSourceCancelCallback;
  type?: undefined;
}

/**
 * An underlying byte source for constructing a {@link ReadableStream}.
 *
 * @public
 */
export interface UnderlyingByteSource {
  /**
   * {@inheritDoc UnderlyingSource.start}
   */
  start?: UnderlyingByteSourceStartCallback;
  /**
   * {@inheritDoc UnderlyingSource.pull}
   */
  pull?: UnderlyingByteSourcePullCallback;
  /**
   * {@inheritDoc UnderlyingSource.cancel}
   */
  cancel?: UnderlyingSourceCancelCallback;
  /**
   * Can be set to "bytes" to signal that the constructed {@link ReadableStream} is a readable byte stream.
   * This ensures that the resulting {@link ReadableStream} will successfully be able to vend BYOB readers via its
   * {@link ReadableStream.(getReader:1) | getReader()} method.
   * It also affects the controller argument passed to the {@link UnderlyingByteSource.start | start()}
   * and {@link UnderlyingByteSource.pull | pull()} methods.
   */
  type: 'bytes';
  /**
   * Can be set to a positive integer to cause the implementation to automatically allocate buffers for the
   * underlying source code to write into. In this case, when a consumer is using a default reader, the stream
   * implementation will automatically allocate an ArrayBuffer of the given size, so that
   * {@link ReadableByteStreamController.byobRequest | controller.byobRequest} is always present,
   * as if the consumer was using a BYOB reader.
   */
  autoAllocateChunkSize?: number;
}

export interface UnderlyingDefaultOrByteSource<R = any> {
  start?: UnderlyingDefaultOrByteSourceStartCallback<R>;
  pull?: UnderlyingDefaultOrByteSourcePullCallback<R>;
  cancel?: UnderlyingSourceCancelCallback;
  type?: ReadableStreamType;
  autoAllocateChunkSize?: number;
}

export interface ValidatedUnderlyingSource<R = any> extends UnderlyingSource<R> {
  pull?: (controller: ReadableStreamDefaultController<R>) => Promise<void>;
  cancel?: (reason: any) => Promise<void>;
}

export interface ValidatedUnderlyingByteSource extends UnderlyingByteSource {
  pull?: (controller: ReadableByteStreamController) => Promise<void>;
  cancel?: (reason: any) => Promise<void>;
}

export type ValidatedUnderlyingDefaultOrByteSource<R = any> =
  | ValidatedUnderlyingSource<R>
  | ValidatedUnderlyingByteSource;
