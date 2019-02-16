// Based on https://twitter.com/eweilow/status/1083360636883685376
export type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
export type InferFunction<Fn> = Fn extends ((...args: infer Args) => any) ? Fn : never;

export type InferFirst<T extends any[]> = T extends [infer First, ...any[]] ? First : never;

// Based on https://github.com/Microsoft/TypeScript/issues/25719
export type InferRest<T extends any[]> =
  ((...args: T) => void) extends ((first: any, ...rest: infer S1) => void) ? S1
    : T extends [infer S2] ? []
      : T extends [] ? []
        : never;

export type Promisify<T> = T extends PromiseLike<infer U> ? Promise<U> : Promise<T>;
