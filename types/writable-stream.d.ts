import { QueuingStrategy } from './queuing-strategy';

export interface WritableStreamConstructor {
  readonly prototype: WritableStream;

  new(underlyingSink?: WritableStreamUnderlyingSink,
      queuingStrategy?: Partial<QueuingStrategy>): WritableStream;
}

export interface WritableStream {
  readonly locked: boolean;

  abort(reason: any): Promise<void>;

  getWriter(): WritableStreamDefaultWriter;
}

export interface WritableStreamUnderlyingSink {
  readonly type?: undefined;

  start?(controller: WritableStreamDefaultController): void | Promise<void>;

  write?(chunk: any, controller: WritableStreamDefaultController): void | Promise<void>;

  close?(): void | Promise<void>;

  abort?(reason: any): void | Promise<void>;
}

export interface WritableStreamDefaultController {
  error(e: any): void;
}

export interface WritableStreamDefaultWriter {
  readonly closed: Promise<void>;
  readonly desiredSize: number | null;
  readonly ready: Promise<void>;

  abort(reason: any): Promise<void>;

  close(): Promise<void>;

  releaseLock(): void;

  write(chunk: any): Promise<void>;
}
