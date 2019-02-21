export type QueuingStrategySizeCallback<T = any> = (chunk: T) => number;

export interface QueuingStrategy<T = any> {
  highWaterMark?: number;
  size?: QueuingStrategySizeCallback<T>;
}
