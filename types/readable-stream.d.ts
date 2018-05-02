import { WritableStream } from './writable-stream';
import { QueuingStrategy } from './queuing-strategy';

export interface ReadableStreamConstructor {
  readonly prototype: ReadableStream;

  new<R = any>(underlyingSource?: ReadableStreamUnderlyingSource<R>,
               strategy?: Partial<QueuingStrategy>): ReadableStream<R>;
}

export interface ReadableStream<R = any> {
  readonly locked: boolean;

  cancel(reason: any): Promise<void>;

  // TODO 'byob' mode is available iff underlyingSource extends ReadableByteStreamStreamUnderlyingSource
  getReader(options: { mode: 'byob' }): ReadableStreamBYOBReader;

  getReader(options?: { mode?: undefined }): ReadableStreamDefaultReader<R>;

  pipeThrough<T = any>(pair: ReadableWritableStreamPair<T, R>,
                       options?: ReadableStreamPipeOptions): typeof pair['readable'];

  pipeTo(dest: WritableStream<R>, options?: ReadableStreamPipeOptions): Promise<void>;

  tee(): [ReadableStream<R>, ReadableStream<R>];
}

export interface ReadableWritableStreamPair<R = any, W = any> {
  readonly readable: ReadableStream<R>;
  readonly writable: WritableStream<W>;
}

export interface ReadableStreamUnderlyingSourceBase<C extends ReadableStreamControllerBase> {
  start?(controller: C): void | Promise<void>;

  pull?(controller: C): void | Promise<void>;

  cancel?(reason: any): void | Promise<void>;
}

export interface ReadableStreamDefaultUnderlyingSource<R = any> extends ReadableStreamUnderlyingSourceBase<ReadableStreamDefaultController<R>> {
  readonly type?: undefined;
}

export interface ReadableByteStreamStreamUnderlyingSource extends ReadableStreamUnderlyingSourceBase<ReadableByteStreamController> {
  readonly type: 'bytes';
  readonly autoAllocateChunkSize?: number;
}

export type ReadableStreamUnderlyingSource<R = any>
  = ReadableStreamDefaultUnderlyingSource<R>
  | ReadableByteStreamStreamUnderlyingSource;

export interface ReadableStreamControllerBase<R = any> {
  readonly desiredSize: number | null;

  close(): void;

  enqueue(chunk: R): void;

  error(e: any): void;
}

export interface ReadableStreamDefaultController<R = any> extends ReadableStreamControllerBase<R> {
}

export interface ReadableByteStreamController extends ReadableStreamControllerBase<ArrayBufferView> {
  readonly byobRequest: ReadableStreamBYOBRequest | undefined;
}

export interface ReadableStreamBYOBRequest {
  readonly view: ArrayBufferView;

  respond(bytesWritten: number): void;

  respondWithNewView(view: ArrayBufferView): void;
}

export interface ReadableStreamReaderBase {
  readonly closed: Promise<void>;

  cancel(reason: any): Promise<void>;

  releaseLock(): void;
}

export interface ReadableStreamDefaultReader<R = any> extends ReadableStreamReaderBase {
  read(): Promise<IteratorResult<R>>;
}

export interface ReadableStreamBYOBReader extends ReadableStreamReaderBase {
  read<T extends ArrayBufferView>(view: T): Promise<IteratorResult<T>>;
}

export interface ReadableStreamPipeOptions {
  preventClose?: boolean;
  preventAbort?: boolean;
  preventCancel?: boolean;
}
