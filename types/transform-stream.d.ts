import { ReadableWritableStreamPair } from './readable-stream';
import { QueuingStrategy } from './queuing-strategy';

export interface TransformStreamConstructor {
  readonly prototype: TransformStream;

  new(transformer?: TransformStreamTransformer,
      writableStrategy?: Partial<QueuingStrategy>,
      readableStrategy?: Partial<QueuingStrategy>): TransformStream;
}

export interface TransformStream extends ReadableWritableStreamPair {
}

export interface TransformStreamTransformer {
  readonly readableType?: undefined;
  readonly writableType?: undefined;

  start?(controller: TransformStreamDefaultController): void | Promise<void>;

  transform?(chunk: any,
             controller: TransformStreamDefaultController): void | Promise<void>;

  flush?(controller: TransformStreamDefaultController): void | Promise<void>;
}

export interface TransformStreamDefaultController {
  readonly desiredSize: number | null;

  enqueue(chunk: any): void;

  error(reason: any): void;

  terminate(): void;
}