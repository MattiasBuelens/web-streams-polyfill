import { ReadableStream as IReadableStream, ReadableStreamConstructor } from './readable-stream';
import { WritableStream as IWritableStream, WritableStreamConstructor } from './writable-stream';
import {
  ByteLengthQueuingStrategy as IByteLengthQueuingStrategy,
  ByteLengthQueuingStrategyConstructor,
  CountQueuingStrategy as ICountQueuingStrategy,
  CountQueuingStrategyConstructor
} from './queuing-strategy';
import { TransformStream as ITransformStream, TransformStreamConstructor } from './transform-stream';

// region Type exports

export * from './readable-stream';
export * from './writable-stream';
export * from './queuing-strategy';
export * from './transform-stream';

// endregion

// region Class exports

export type ReadableStream<R = any> = IReadableStream<R>;
export const ReadableStream: ReadableStreamConstructor;

export type WritableStream<R = any> = IWritableStream<R>;
export const WritableStream: WritableStreamConstructor;

export type CountQueuingStrategy = ICountQueuingStrategy;
export const CountQueuingStrategy: CountQueuingStrategyConstructor;

export type ByteLengthQueuingStrategy = IByteLengthQueuingStrategy;
export const ByteLengthQueuingStrategy: ByteLengthQueuingStrategyConstructor;

export type TransformStream<I = any, O = any> = ITransformStream<I, O>;
export const TransformStream: TransformStreamConstructor;

// endregion
