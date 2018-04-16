export type QueuingStrategySize = (chunk: any) => number;

export interface QueuingStrategy {
  readonly highWaterMark: number;
  readonly size: QueuingStrategySize | undefined;
}

export interface CountQueuingStrategyConstructor {
  readonly prototype: CountQueuingStrategy;

  new(options: { highWaterMark?: number }): CountQueuingStrategy;
}

export interface CountQueuingStrategy extends QueuingStrategy {
  readonly highWaterMark: number;

  size(chunk: any): number;
}

export interface ByteLengthQueuingStrategyConstructor {
  readonly prototype: ByteLengthQueuingStrategy;

  new(options: { highWaterMark?: number }): ByteLengthQueuingStrategy;
}

export interface ByteLengthQueuingStrategy extends QueuingStrategy {
  readonly highWaterMark: number;

  size(chunk: ArrayBufferView): number;
}
