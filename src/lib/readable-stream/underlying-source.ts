import { ReadableStreamDefaultController } from './default-controller';
import { ReadableByteStreamController } from './byte-stream-controller';

export type ReadableStreamController<R = any> = ReadableStreamDefaultController<R> | ReadableByteStreamController;
export type UnderlyingDefaultOrByteSourceStartCallback<R> = (controller: ReadableStreamController<R>) => void | PromiseLike<void>;
export type UnderlyingDefaultOrByteSourcePullCallback<R> = (controller: ReadableStreamController<R>) => void | PromiseLike<void>;

export type UnderlyingSourceStartCallback<R> = (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
export type UnderlyingSourcePullCallback<R> = (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
export type UnderlyingByteSourceStartCallback = (controller: ReadableByteStreamController) => void | PromiseLike<void>;
export type UnderlyingByteSourcePullCallback = (controller: ReadableByteStreamController) => void | PromiseLike<void>;
export type UnderlyingSourceCancelCallback = (reason: any) => void | PromiseLike<void>;

export type ReadableStreamType = 'bytes';

export interface UnderlyingSource<R = any> {
  start?: UnderlyingSourceStartCallback<R>;
  pull?: UnderlyingSourcePullCallback<R>;
  cancel?: UnderlyingSourceCancelCallback;
  type?: undefined;
}

export interface UnderlyingByteSource {
  start?: UnderlyingByteSourceStartCallback;
  pull?: UnderlyingByteSourcePullCallback;
  cancel?: UnderlyingSourceCancelCallback;
  type: 'bytes';
  autoAllocateChunkSize?: number;
}

export interface UnderlyingDefaultOrByteSource<R = any> {
  start?: UnderlyingDefaultOrByteSourceStartCallback<R>;
  pull?: UnderlyingDefaultOrByteSourcePullCallback<R>;
  cancel?: UnderlyingSourceCancelCallback;
  type?: ReadableStreamType;
  autoAllocateChunkSize?: number;
}

export interface ValidatedUnderlyingSource<R = any> extends UnderlyingSource<R> {
  pull?: (controller: ReadableStreamDefaultController<R>) => Promise<void>;
  cancel?: (reason: any) => Promise<void>;
}

export interface ValidatedUnderlyingByteSource extends UnderlyingByteSource {
  pull?: (controller: ReadableByteStreamController) => Promise<void>;
  cancel?: (reason: any) => Promise<void>;
}

export type ValidatedUnderlyingDefaultOrByteSource<R = any> =
  | ValidatedUnderlyingSource<R>
  | ValidatedUnderlyingByteSource;
