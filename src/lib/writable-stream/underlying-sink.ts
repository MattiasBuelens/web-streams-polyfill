import { WritableStreamDefaultController } from '../writable-stream';

export type WritableStreamDefaultControllerStartCallback
  = (controller: WritableStreamDefaultController) => void | PromiseLike<void>;
export type WritableStreamDefaultControllerWriteCallback<W>
  = (chunk: W, controller: WritableStreamDefaultController) => void | PromiseLike<void>;
export type WritableStreamDefaultControllerCloseCallback = () => void | PromiseLike<void>;
export type WritableStreamErrorCallback = (reason: any) => void | PromiseLike<void>;

export interface UnderlyingSink<W = any> {
  start?: WritableStreamDefaultControllerStartCallback;
  write?: WritableStreamDefaultControllerWriteCallback<W>;
  close?: WritableStreamDefaultControllerCloseCallback;
  abort?: WritableStreamErrorCallback;
  type?: undefined;
}
