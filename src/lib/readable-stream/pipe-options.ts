import { AbortSignal } from '../abort-signal';

/**
 * Options for {@link ReadableStream.pipeTo | piping} a stream.
 *
 * @public
 */
export interface StreamPipeOptions {
  /**
   * If set to true, {@link ReadableStream.pipeTo} will not abort the writable stream if the readable stream errors.
   */
  preventAbort?: boolean;
  /**
   * If set to true, {@link ReadableStream.pipeTo} will not cancel the readable stream if the writable stream closes
   * or errors.
   */
  preventCancel?: boolean;
  /**
   * If set to true, {@link ReadableStream.pipeTo} will not close the writable stream if the readable stream closes.
   */
  preventClose?: boolean;
  /**
   * Can be set to an {@link AbortSignal} to allow aborting an ongoing pipe operation via the corresponding
   * `AbortController`. In this case, the source readable stream will be canceled, and the destination writable stream
   * aborted, unless the respective options `preventCancel` or `preventAbort` are set.
   */
  signal?: AbortSignal;
}

export interface ValidatedStreamPipeOptions {
  preventAbort: boolean;
  preventCancel: boolean;
  preventClose: boolean;
  signal?: AbortSignal;
}
