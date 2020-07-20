import { AbortSignal } from '../abort-signal';

export interface StreamPipeOptions {
  preventAbort?: boolean;
  preventCancel?: boolean;
  preventClose?: boolean;
  signal?: AbortSignal;
}

export interface ValidatedStreamPipeOptions {
  preventAbort: boolean;
  preventCancel: boolean;
  preventClose: boolean;
  signal?: AbortSignal;
}
