import { ReadableStream } from '../readable-stream';
import { WritableStream } from '../writable-stream';

export interface ReadableWritablePair<R, W> {
  readable: ReadableStream<R>;
  writable: WritableStream<W>;
}
