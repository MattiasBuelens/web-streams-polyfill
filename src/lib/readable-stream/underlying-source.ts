import { ReadableStreamDefaultController } from './default-controller';
import { ReadableByteStreamController } from './byte-stream-controller';

export type ReadableStreamDefaultControllerCallback<R> = (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
export type ReadableByteStreamControllerCallback = (controller: ReadableByteStreamController) => void | PromiseLike<void>;
export type ReadableStreamErrorCallback = (reason: any) => void | PromiseLike<void>;

export interface UnderlyingSource<R = any> {
  start?: ReadableStreamDefaultControllerCallback<R>;
  pull?: ReadableStreamDefaultControllerCallback<R>;
  cancel?: ReadableStreamErrorCallback;
  type?: undefined;
}

export interface UnderlyingByteSource {
  start?: ReadableByteStreamControllerCallback;
  pull?: ReadableByteStreamControllerCallback;
  cancel?: ReadableStreamErrorCallback;
  type: 'bytes';
  autoAllocateChunkSize?: number;
}
