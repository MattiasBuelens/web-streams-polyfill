import { assertDictionary, assertFunction } from './basic';
import { promiseCall, reflectCall } from '../helpers/webidl';
import {
  UnderlyingSink,
  UnderlyingSinkAbortCallback,
  UnderlyingSinkCloseCallback,
  UnderlyingSinkStartCallback,
  UnderlyingSinkWriteCallback,
  ValidatedUnderlyingSink
} from '../writable-stream/underlying-sink';
import { WritableStreamDefaultController } from '../writable-stream';

export function convertUnderlyingSink<W>(original: UnderlyingSink<W> | null,
                                         context: string): ValidatedUnderlyingSink<W> {
  assertDictionary(original, context);
  const abort = original?.abort;
  const close = original?.close;
  const start = original?.start;
  const type = original?.type;
  const write = original?.write;
  return {
    abort: abort === undefined ?
      undefined :
      convertUnderlyingSinkAbortCallback(abort, original!, `${context} has member 'abort' that`),
    close: close === undefined ?
      undefined :
      convertUnderlyingSinkCloseCallback(close, original!, `${context} has member 'close' that`),
    start: start === undefined ?
      undefined :
      convertUnderlyingSinkStartCallback(start, original!, `${context} has member 'start' that`),
    write: write === undefined ?
      undefined :
      convertUnderlyingSinkWriteCallback(write, original!, `${context} has member 'write' that`),
    type
  };
}

function convertUnderlyingSinkAbortCallback(
  fn: UnderlyingSinkAbortCallback,
  original: UnderlyingSink,
  context: string
): (reason: any) => Promise<void> {
  assertFunction(fn, context);
  return (reason: any) => promiseCall(fn, original, [reason]);
}

function convertUnderlyingSinkCloseCallback(
  fn: UnderlyingSinkCloseCallback,
  original: UnderlyingSink,
  context: string
): () => Promise<void> {
  assertFunction(fn, context);
  return () => promiseCall(fn, original, []);
}

function convertUnderlyingSinkStartCallback(
  fn: UnderlyingSinkStartCallback,
  original: UnderlyingSink,
  context: string
): UnderlyingSinkStartCallback {
  assertFunction(fn, context);
  return (controller: WritableStreamDefaultController) => reflectCall(fn, original, [controller]);
}

function convertUnderlyingSinkWriteCallback<W>(
  fn: UnderlyingSinkWriteCallback<W>,
  original: UnderlyingSink<W>,
  context: string
): (chunk: W, controller: WritableStreamDefaultController) => Promise<void> {
  assertFunction(fn, context);
  return (chunk: W, controller: WritableStreamDefaultController) => promiseCall(fn, original, [chunk, controller]);
}
