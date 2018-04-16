import { ReadableWritableStreamPair } from './readable-stream';
import { QueuingStrategy } from './queuing-strategy';

export interface TransformStreamConstructor {
  readonly prototype: TransformStream;

  new<I = any, O = any>(transformer?: TransformStreamTransformer<I, O>,
                        writableStrategy?: Partial<QueuingStrategy>,
                        readableStrategy?: Partial<QueuingStrategy>): TransformStream<I, O>;
}

export interface TransformStream<I = any, O = any> extends ReadableWritableStreamPair<O, I> {
}

export interface TransformStreamTransformer<I = any, O = any> {
  readonly readableType?: undefined;
  readonly writableType?: undefined;

  start?(controller: TransformStreamDefaultController<O>): void | Promise<void>;

  transform?(chunk: I,
             controller: TransformStreamDefaultController<O>): void | Promise<void>;

  flush?(controller: TransformStreamDefaultController<O>): void | Promise<void>;
}

export interface TransformStreamDefaultController<O = any> {
  readonly desiredSize: number | null;

  enqueue(chunk: O): void;

  error(reason: any): void;

  terminate(): void;
}
