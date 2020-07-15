import { TransformStreamDefaultController } from '../transform-stream';

export type TransformStreamDefaultControllerCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
export type TransformStreamDefaultControllerTransformCallback<I, O>
  = (chunk: I, controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;

export interface Transformer<I = any, O = any> {
  start?: TransformStreamDefaultControllerCallback<O>;
  transform?: TransformStreamDefaultControllerTransformCallback<I, O>;
  flush?: TransformStreamDefaultControllerCallback<O>;
  readableType?: undefined;
  writableType?: undefined;
}
