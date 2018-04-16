import { WritableStream } from './writable-stream';
import { QueuingStrategy } from './queuing-strategy';

export interface ReadableStreamConstructor {
  readonly prototype: ReadableStream;

  new(underlyingSource?: ReadableStreamUnderlyingSource,
      queuingStrategy?: Partial<QueuingStrategy>): ReadableStream;
}

export interface ReadableStream {
  readonly locked: boolean;

  cancel(reason: any): Promise<void>;

  getReader(options: { mode: 'byob' }): ReadableStreamBYOBReader;

  getReader(options?: { mode?: string }): ReadableStreamDefaultReader;

  pipeThrough(pair: ReadableWritableStreamPair,
              options?: ReadableStreamPipeOptions): ReadableStream;

  pipeTo(dest: WritableStream,
         options?: ReadableStreamPipeOptions): Promise<void>;

  tee(): [ReadableStream, ReadableStream];
}

export interface ReadableWritableStreamPair {
  readonly readable: ReadableStream;
  readonly writable: WritableStream;
}

export interface ReadableStreamDefaultUnderlyingSource {
  readonly type?: undefined;

  start?(controller: ReadableStreamDefaultController): void | Promise<void>;

  pull?(controller: ReadableStreamDefaultController): void | Promise<void>;

  cancel?(reason: any): void | Promise<void>;
}

export interface ReadableByteStreamStreamUnderlyingSource {
  readonly type: 'bytes';
  readonly autoAllocateChunkSize?: number;

  start?(controller: ReadableByteStreamController): void | Promise<void>;

  pull?(controller: ReadableByteStreamController): void | Promise<void>;

  cancel?(reason: any): void | Promise<void>;
}

export type ReadableStreamUnderlyingSource
  = ReadableStreamDefaultUnderlyingSource
  | ReadableByteStreamStreamUnderlyingSource;

export interface ReadableStreamDefaultController {
  readonly desiredSize: number | null;

  close(): void;

  enqueue(chunk: any): void;

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

export interface ReadableStreamDefaultReader {
  readonly closed: Promise<void>;

  cancel(reason: any): Promise<void>;

  read(): Promise<IteratorResult<any>>;

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
