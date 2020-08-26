export type QueuingStrategySizeCallback<T = any> = (chunk: T) => number;

/**
 * @public
 */
export interface QueuingStrategyInit {
  /**
   * {@inheritDoc QueuingStrategy.highWaterMark}
   */
  highWaterMark: number;
}

/**
 * A queuing strategy.
 *
 * @public
 */
export interface QueuingStrategy<T = any> {
  /**
   * A non-negative number indicating the high water mark of the stream using this queuing strategy.
   */
  highWaterMark?: number;
  /**
   * A function that computes and returns the finite non-negative size of the given chunk value.
   */
  size?: QueuingStrategySizeCallback<T>;
}
