export interface QueuingStrategy<T> {
  highWaterMark?: number;
  size?: (chunk: T) => number;
}
