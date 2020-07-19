import { assertDictionary } from './basic';
import { PipeOptions, ValidatedPipeOptions } from '../readable-stream/pipe-options';
import { AbortSignal, isAbortSignal } from '../abort-signal';

export function convertPipeOptions(options: PipeOptions | undefined,
                                   context: string): ValidatedPipeOptions {
  assertDictionary(options, context);
  const preventAbort = options?.preventAbort;
  const preventCancel = options?.preventCancel;
  const preventClose = options?.preventClose;
  const signal = options?.signal;
  return {
    preventAbort: Boolean(preventAbort),
    preventCancel: Boolean(preventCancel),
    preventClose: Boolean(preventClose),
    signal: signal === undefined ? undefined : convertAbortSignal(signal, `${context} has member 'signal' that`)
  };
}

function convertAbortSignal(signal: AbortSignal, context: string): AbortSignal {
  if (!isAbortSignal(signal)) {
    throw new TypeError(`${context} is not an AbortSignal.`);
  }
  return signal;
}
