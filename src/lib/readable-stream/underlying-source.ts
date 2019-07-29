import { ReadableStreamDefaultControllerType } from './default-controller';
import { ReadableByteStreamControllerType } from './byte-stream-controller';

export type ReadableStreamDefaultControllerCallback<R> = (controller: ReadableStreamDefaultControllerType<R>) => void | PromiseLike<void>;
export type ReadableByteStreamControllerCallback = (controller: ReadableByteStreamControllerType) => void | PromiseLike<void>;
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
