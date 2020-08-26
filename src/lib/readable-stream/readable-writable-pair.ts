import { ReadableStream } from '../readable-stream';
import { WritableStream } from '../writable-stream';

/**
 * A pair of a {@link ReadableStream | readable stream} and {@link WritableStream | writable stream} that can be passed
 * to {@link ReadableStream.pipeThrough}.
 *
 * @public
 */
export interface ReadableWritablePair<R, W> {
  readable: ReadableStream<R>;
  writable: WritableStream<W>;
}
