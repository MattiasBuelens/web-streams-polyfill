import {
  ReadableByteStreamStreamUnderlyingSource,
  ReadableStream as IReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultUnderlyingSource,
  ReadableStreamPipeOptions,
  ReadableWritableStreamPair
} from './readable-stream';
import {
  WritableStream as IWritableStream,
  WritableStreamDefaultWriter,
  WritableStreamUnderlyingSink
} from './writable-stream';
import { QueuingStrategy } from './queuing-strategy';
import { TransformStream as ITransformStream, TransformStreamTransformer } from './transform-stream';

// region Type exports

export * from './readable-stream';
export * from './writable-stream';
export * from './queuing-strategy';
export * from './transform-stream';

// endregion

// region Class exports

export declare class ReadableStream<R = any> implements IReadableStream<R> {

  constructor(underlyingSource?: ReadableStreamDefaultUnderlyingSource<R> | ReadableByteStreamStreamUnderlyingSource,
              queuingStrategy?: Partial<QueuingStrategy>);

  readonly locked: boolean;

  cancel(reason: any): Promise<void>;

  getReader(options: { mode: 'byob' }): ReadableStreamBYOBReader;
  getReader(options?: { mode?: string }): ReadableStreamDefaultReader<R>;

  pipeThrough<T = any>(pair: ReadableWritableStreamPair<T, R>,
                       options?: ReadableStreamPipeOptions): IReadableStream<T>;

  pipeTo(dest: WritableStream<R>, options?: ReadableStreamPipeOptions): Promise<void>;

  tee(): [ReadableStream<R>, ReadableStream<R>];

}

export declare class WritableStream<W = any> implements IWritableStream<W> {

  constructor(underlyingSink?: WritableStreamUnderlyingSink<W>, queuingStrategy?: Partial<QueuingStrategy>);

  readonly locked: boolean;

  abort(reason: any): Promise<void>;

  getWriter(): WritableStreamDefaultWriter<W>;

}

export declare class CountQueuingStrategy implements QueuingStrategy {

  constructor(options: { highWaterMark?: number });

  readonly highWaterMark: number;

  size(chunk: any): number;

}

export declare class ByteLengthQueuingStrategy implements QueuingStrategy {

  constructor(options: { highWaterMark?: number });

  readonly highWaterMark: number;

  size(chunk: ArrayBufferView): number;
}

export declare class TransformStream<I = any, O = any> implements ITransformStream<I, O> {

  constructor(transformer?: TransformStreamTransformer,
              writableStrategy?: Partial<QueuingStrategy>,
              readableStrategy?: Partial<QueuingStrategy>);

  readonly readable: ReadableStream<O>;
  readonly writable: WritableStream<I>;

}

// endregion
