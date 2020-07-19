import { ReadableStreamDefaultController } from './default-controller';
import { ReadableByteStreamController } from './byte-stream-controller';

export type ReadableStreamController<R = any> = ReadableStreamDefaultController<R> | ReadableByteStreamController;
export type UnderlyingSourceStartCallback<R> = (controller: ReadableStreamController<R>) => void | PromiseLike<void>;
export type UnderlyingSourcePullCallback<R> = (controller: ReadableStreamController<R>) => void | PromiseLike<void>;
export type UnderlyingSourceCancelCallback = (reason: any) => void | PromiseLike<void>;

export type ReadableStreamType = 'bytes';

export type ReadableStreamDefaultControllerCallback<R> = (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
export type ReadableByteStreamControllerCallback = (controller: ReadableByteStreamController) => void | PromiseLike<void>;
export type ReadableStreamErrorCallback = UnderlyingSourceCancelCallback;

export interface UnderlyingSource<R = any> {
  start?: ReadableStreamDefaultControllerCallback<R>;
  pull?: ReadableStreamDefaultControllerCallback<R>;
  cancel?: UnderlyingSourceCancelCallback;
  type?: undefined;
}

export interface UnderlyingByteSource {
  start?: ReadableByteStreamControllerCallback;
  pull?: ReadableByteStreamControllerCallback;
  cancel?: UnderlyingSourceCancelCallback;
  type: 'bytes';
  autoAllocateChunkSize?: number;
}

/** @internal */
export interface UnderlyingDefaultOrByteSource<R = any> {
  start?: UnderlyingSourceStartCallback<R>;
  pull?: UnderlyingSourcePullCallback<R>;
  cancel?: UnderlyingSourceCancelCallback;
  type?: ReadableStreamType;
  autoAllocateChunkSize?: number;
}

/** @internal */
export interface ValidatedUnderlyingSource<R = any> extends UnderlyingSource<R> {
  pull?: (controller: ReadableStreamDefaultController<R>) => Promise<void>;
  cancel?: (reason: any) => Promise<void>;
}

/** @internal */
export interface ValidatedUnderlyingByteSource extends UnderlyingByteSource {
  pull?: (controller: ReadableByteStreamController) => Promise<void>;
  cancel?: (reason: any) => Promise<void>;
}

/** @internal */
export type ValidatedUnderlyingDefaultOrByteSource<R = any> =
  | ValidatedUnderlyingSource<R>
  | ValidatedUnderlyingByteSource;
