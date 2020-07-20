import { WritableStreamDefaultController } from '../writable-stream';

export type UnderlyingSinkStartCallback
  = (controller: WritableStreamDefaultController) => void | PromiseLike<void>;
export type UnderlyingSinkWriteCallback<W>
  = (chunk: W, controller: WritableStreamDefaultController) => void | PromiseLike<void>;
export type UnderlyingSinkCloseCallback = () => void | PromiseLike<void>;
export type UnderlyingSinkAbortCallback = (reason: any) => void | PromiseLike<void>;

export interface UnderlyingSink<W = any> {
  start?: UnderlyingSinkStartCallback;
  write?: UnderlyingSinkWriteCallback<W>;
  close?: UnderlyingSinkCloseCallback;
  abort?: UnderlyingSinkAbortCallback;
  type?: undefined;
}

export interface ValidatedUnderlyingSink<W = any> extends UnderlyingSink<W> {
  write?: (chunk: W, controller: WritableStreamDefaultController) => Promise<void>;
  close?: () => Promise<void>;
  abort?: (reason: any) => Promise<void>;
}
