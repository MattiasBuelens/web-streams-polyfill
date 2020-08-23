import { WritableStreamDefaultController } from '../writable-stream';

/** @public */
export type UnderlyingSinkStartCallback
  = (controller: WritableStreamDefaultController) => void | PromiseLike<void>;
/** @public */
export type UnderlyingSinkWriteCallback<W>
  = (chunk: W, controller: WritableStreamDefaultController) => void | PromiseLike<void>;
/** @public */
export type UnderlyingSinkCloseCallback = () => void | PromiseLike<void>;
/** @public */
export type UnderlyingSinkAbortCallback = (reason: any) => void | PromiseLike<void>;

/**
 * An underlying sink for constructing a {@link WritableStream}.
 *
 * @public
 */
export interface UnderlyingSink<W = any> {
  /**
   * A function that is called immediately during creation of the {@link WritableStream}.
   */
  start?: UnderlyingSinkStartCallback;
  /**
   * A function that is called when a new chunk of data is ready to be written to the underlying sink. The stream
   * implementation guarantees that this function will be called only after previous writes have succeeded, and never
   * before {@link UnderlyingSink.start | start()} has succeeded or after {@link UnderlyingSink.close | close()} or
   * {@link UnderlyingSink.abort | abort()} have been called.
   *
   * This function is used to actually send the data to the resource presented by the underlying sink, for example by
   * calling a lower-level API.
   */
  write?: UnderlyingSinkWriteCallback<W>;
  /**
   * A function that is called after the producer signals, via
   * {@link WritableStreamDefaultWriter.close | writer.close()}, that they are done writing chunks to the stream, and
   * subsequently all queued-up writes have successfully completed.
   *
   * This function can perform any actions necessary to finalize or flush writes to the underlying sink, and release
   * access to any held resources.
   */
  close?: UnderlyingSinkCloseCallback;
  /**
   * A function that is called after the producer signals, via {@link WritableStream.abort | stream.abort()} or
   * {@link WritableStreamDefaultWriter.abort | writer.abort()}, that they wish to abort the stream. It takes as its
   * argument the same value as was passed to those methods by the producer.
   *
   * Writable streams can additionally be aborted under certain conditions during piping; see the definition of the
   * {@link ReadableStream.pipeTo | pipeTo()} method for more details.
   *
   * This function can clean up any held resources, much like {@link UnderlyingSink.close | close()}, but perhaps with
   * some custom handling.
   */
  abort?: UnderlyingSinkAbortCallback;
  type?: undefined;
}

export interface ValidatedUnderlyingSink<W = any> extends UnderlyingSink<W> {
  write?: (chunk: W, controller: WritableStreamDefaultController) => Promise<void>;
  close?: () => Promise<void>;
  abort?: (reason: any) => Promise<void>;
}
