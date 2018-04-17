import { WritableStream } from './writable-stream';
import { QueuingStrategy } from './queuing-strategy';

export interface ReadableStreamConstructor {
  readonly prototype: ReadableStream;

  new<R = any>(underlyingSource?: ReadableStreamUnderlyingSource<R>,
               queuingStrategy?: Partial<QueuingStrategy>): ReadableStream<R>;
}

export interface ReadableStream<R = any> {
  readonly locked: boolean;

  cancel(reason: any): Promise<void>;

  // TODO 'byob' mode is available iff underlyingSource extends ReadableByteStreamStreamUnderlyingSource
  getReader(options: { mode: (R extends Uint8Array ? 'byob' : never) }): ReadableStreamBYOBReader;

  getReader(options?: { mode?: undefined }): ReadableStreamDefaultReader<R>;

  pipeThrough<T = any>(pair: ReadableWritableStreamPair<T, R>,
                       options?: ReadableStreamPipeOptions): ReadableStream<T>;

  pipeTo(dest: WritableStream<R>, options?: ReadableStreamPipeOptions): Promise<void>;

  tee(): [ReadableStream<R>, ReadableStream<R>];
}

export interface ReadableWritableStreamPair<R = any, W = any> {
  readonly readable: ReadableStream<R>;
  readonly writable: WritableStream<W>;
}

export interface ReadableStreamDefaultUnderlyingSource<R = any> {
  readonly type?: undefined;

  start?(controller: ReadableStreamDefaultController<R>): void | Promise<void>;

  pull?(controller: ReadableStreamDefaultController<R>): void | Promise<void>;

  cancel?(reason: any): void | Promise<void>;
}

export interface ReadableByteStreamStreamUnderlyingSource {
  readonly type: 'bytes';
  readonly autoAllocateChunkSize?: number;

  start?(controller: ReadableByteStreamController): void | Promise<void>;

  pull?(controller: ReadableByteStreamController): void | Promise<void>;

  cancel?(reason: any): void | Promise<void>;
}

export type ReadableStreamUnderlyingSource<R = any>
  = ReadableStreamDefaultUnderlyingSource<R>
  | (R extends Uint8Array ? ReadableByteStreamStreamUnderlyingSource : never);

export interface ReadableStreamDefaultController<R = any> {
  readonly desiredSize: number | null;

  close(): void;

  enqueue(chunk: R): void;

  error(e: any): void;
}

export interface ReadableByteStreamController {
  readonly byobRequest: ReadableStreamBYOBRequest | undefined;
  readonly desiredSize: number | null;

  close(): void;

  enqueue(chunk: ArrayBufferView): void;

  error(e: any): void;
}

export interface ReadableStreamBYOBRequest {
  readonly view: ArrayBufferView;

  respond(bytesWritten: number): void;

  respondWithNewView(view: ArrayBufferView): void;
}

export interface ReadableStreamDefaultReader<R = any> {
  readonly closed: Promise<void>;

  cancel(reason: any): Promise<void>;

  read(): Promise<IteratorResult<R>>;

  releaseLock(): void;
}

export interface ReadableStreamBYOBReader {
  readonly closed: Promise<void>;

  cancel(reason: any): Promise<void>;

  read<T extends ArrayBufferView>(view: T): Promise<IteratorResult<T>>;

  releaseLock(): void;
}

export interface ReadableStreamPipeOptions {
  preventClose?: boolean;
  preventAbort?: boolean;
  preventCancel?: boolean;
}
