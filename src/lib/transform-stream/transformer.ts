import { TransformStreamDefaultController } from '../transform-stream';

/** @public */
export type TransformerStartCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
/** @public */
export type TransformerFlushCallback<O>
  = (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
/** @public */
export type TransformerTransformCallback<I, O>
  = (chunk: I, controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;

/**
 * A transformer for constructing a {@link TransformStream}.
 *
 * @public
 */
export interface Transformer<I = any, O = any> {
  /**
   * A function that is called immediately during creation of the {@link TransformStream}.
   */
  start?: TransformerStartCallback<O>;
  /**
   * A function called when a new chunk originally written to the writable side is ready to be transformed.
   */
  transform?: TransformerTransformCallback<I, O>;
  /**
   * A function called after all chunks written to the writable side have been transformed by successfully passing
   * through {@link Transformer.transform | transform()}, and the writable side is about to be closed.
   */
  flush?: TransformerFlushCallback<O>;
  readableType?: undefined;
  writableType?: undefined;
}

export interface ValidatedTransformer<I = any, O = any> extends Transformer<I, O> {
  transform?: (chunk: I, controller: TransformStreamDefaultController<O>) => Promise<void>;
  flush?: (controller: TransformStreamDefaultController<O>) => Promise<void>;
}
