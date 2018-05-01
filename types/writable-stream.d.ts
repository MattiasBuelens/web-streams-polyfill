import { QueuingStrategy } from './queuing-strategy';

export interface WritableStreamConstructor {
  readonly prototype: WritableStream;

  new<W = any>(underlyingSink?: WritableStreamUnderlyingSink<W>,
               strategy?: Partial<QueuingStrategy>): WritableStream<W>;
}

export interface WritableStream<W = any> {
  readonly locked: boolean;

  abort(reason: any): Promise<void>;

  getWriter(): WritableStreamDefaultWriter<W>;
}

export interface WritableStreamUnderlyingSink<W = any> {
  readonly type?: undefined;

  start?(controller: WritableStreamDefaultController): void | Promise<void>;

  write?(chunk: W, controller: WritableStreamDefaultController): void | Promise<void>;

  close?(): void | Promise<void>;

  abort?(reason: any): void | Promise<void>;
}

export interface WritableStreamDefaultController {
  error(e: any): void;
}

export interface WritableStreamDefaultWriter<W = any> {
  readonly closed: Promise<void>;
  readonly desiredSize: number | null;
  readonly ready: Promise<void>;

  abort(reason: any): Promise<void>;

  close(): Promise<void>;

  releaseLock(): void;

  write(chunk: W): Promise<void>;
}
