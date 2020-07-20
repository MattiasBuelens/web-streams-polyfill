import { assertDictionary } from './basic';
import { StreamPipeOptions, ValidatedStreamPipeOptions } from '../readable-stream/pipe-options';
import { AbortSignal, isAbortSignal } from '../abort-signal';

export function convertPipeOptions(options: StreamPipeOptions | null | undefined,
                                   context: string): ValidatedStreamPipeOptions {
  assertDictionary(options, context);
  const preventAbort = options?.preventAbort;
  const preventCancel = options?.preventCancel;
  const preventClose = options?.preventClose;
  const signal = options?.signal;
  if (signal !== undefined) {
    assertAbortSignal(signal, `${context} has member 'signal' that`);
  }
  return {
    preventAbort: Boolean(preventAbort),
    preventCancel: Boolean(preventCancel),
    preventClose: Boolean(preventClose),
    signal
  };
}

function assertAbortSignal(signal: unknown, context: string): asserts signal is AbortSignal {
  if (!isAbortSignal(signal)) {
    throw new TypeError(`${context} is not an AbortSignal.`);
  }
}
