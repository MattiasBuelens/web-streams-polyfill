import { TransformStreamDefaultController } from '../transform-stream';

export type TransformerStartCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
export type TransformerFlushCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
export type TransformerTransformCallback<I, O>
  = (chunk: I, controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;

export type TransformStreamDefaultControllerCallback<O> = TransformerStartCallback<O>;
export type TransformStreamDefaultControllerTransformCallback<I, O> = TransformerTransformCallback<I, O>;

export interface Transformer<I = any, O = any> {
  start?: TransformerStartCallback<O>;
  transform?: TransformerTransformCallback<I, O>;
  flush?: TransformerFlushCallback<O>;
  readableType?: undefined;
  writableType?: undefined;
}
