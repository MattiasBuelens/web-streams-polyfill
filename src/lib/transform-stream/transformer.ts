import { TransformStreamDefaultController } from '../transform-stream';

export type TransformerStartCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
export type TransformerFlushCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
export type TransformerTransformCallback<I, O>
  = (chunk: I, controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;

export interface Transformer<I = any, O = any> {
  start?: TransformerStartCallback<O>;
  transform?: TransformerTransformCallback<I, O>;
  flush?: TransformerFlushCallback<O>;
  readableType?: undefined;
  writableType?: undefined;
}

export interface ValidatedTransformer<I = any, O = any> extends Transformer<I, O> {
  transform?: (chunk: I, controller: TransformStreamDefaultController<O>) => Promise<void>;
  flush?: (controller: TransformStreamDefaultController<O>) => Promise<void>;
}
