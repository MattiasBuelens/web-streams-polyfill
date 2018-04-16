import {
  ReadableStream as IReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader,
  ReadableStreamPipeOptions,
  ReadableStreamUnderlyingSource,
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

export declare class ReadableStream implements IReadableStream {

  constructor(underlyingSource?: ReadableStreamUnderlyingSource, queuingStrategy?: Partial<QueuingStrategy>);

  readonly locked: boolean;

  cancel(reason: any): Promise<void>;

  getReader(options: { mode: 'byob' }): ReadableStreamBYOBReader;
  getReader(options?: { mode?: string }): ReadableStreamDefaultReader;

  pipeThrough(pair: ReadableWritableStreamPair, options?: ReadableStreamPipeOptions): ReadableStream;

  pipeTo(dest: WritableStream, options?: ReadableStreamPipeOptions): Promise<void>;

  tee(): [ReadableStream, ReadableStream];

}

export declare class WritableStream implements IWritableStream {

  constructor(underlyingSink?: WritableStreamUnderlyingSink, queuingStrategy?: Partial<QueuingStrategy>);

  readonly locked: boolean;

  abort(reason: any): Promise<void>;

  getWriter(): WritableStreamDefaultWriter;

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


export declare class TransformStream implements ITransformStream {

  constructor(transformer?: TransformStreamTransformer,
              writableStrategy?: Partial<QueuingStrategy>,
              readableStrategy?: Partial<QueuingStrategy>);

  readonly readable: ReadableStream;
  readonly writable: WritableStream;

}

// endregion
