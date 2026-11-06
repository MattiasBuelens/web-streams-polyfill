import { CreateReadableStream, type DefaultReadableStream } from '../readable-stream';
import type { ReadableStreamLike } from './readable-stream-like';
import {
  type ReadableStreamDefaultController,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue
} from './default-controller';
import { type FromSourceControllerOps, ReadableStreamFromSource } from './from-source';
import { noop } from '../../utils';

const defaultControllerOps: FromSourceControllerOps<ReadableStreamDefaultController<any>> = {
  enqueue: ReadableStreamDefaultControllerEnqueue,
  close: ReadableStreamDefaultControllerClose
};

export function ReadableStreamFrom<R>(source: Iterable<R> | AsyncIterable<R> | ReadableStreamLike<R>): DefaultReadableStream<R> {
  const fromSource = ReadableStreamFromSource(source, defaultControllerOps);
  let stream: DefaultReadableStream<R>;
  const pullAlgorithm = () => fromSource.pull(stream._readableStreamController);
  const cancelAlgorithm = (reason: any) => fromSource.cancel(reason);
  stream = CreateReadableStream(noop, pullAlgorithm, cancelAlgorithm, 0);
  return stream;
}
