import { assertDictionary, assertFunction, convertUnsignedLongLongWithEnforceRange } from './basic';
import {
  ReadableStreamController,
  UnderlyingByteSource,
  UnderlyingDefaultOrByteSource,
  UnderlyingDefaultOrByteSourcePullCallback,
  UnderlyingDefaultOrByteSourceStartCallback,
  UnderlyingSource,
  UnderlyingSourceCancelCallback,
  ValidatedUnderlyingDefaultOrByteSource
} from '../readable-stream/underlying-source';
import { promiseCall, reflectCall } from '../helpers/webidl';

export function convertUnderlyingDefaultOrByteSource<R>(
  source: UnderlyingSource<R> | UnderlyingByteSource | null,
  context: string
): ValidatedUnderlyingDefaultOrByteSource<R> {
  assertDictionary(source, context);
  const original = source as (UnderlyingDefaultOrByteSource<R> | null);
  const autoAllocateChunkSize = original?.autoAllocateChunkSize;
  const cancel = original?.cancel;
  const pull = original?.pull;
  const start = original?.start;
  const type = original?.type;
  return {
    autoAllocateChunkSize: autoAllocateChunkSize === undefined ?
      undefined :
      convertUnsignedLongLongWithEnforceRange(
        autoAllocateChunkSize,
        `${context} has member 'autoAllocateChunkSize' that`
      ),
    cancel: cancel === undefined ?
      undefined :
      convertUnderlyingSourceCancelCallback(cancel, original!, `${context} has member 'cancel' that`),
    pull: pull === undefined ?
      undefined :
      convertUnderlyingSourcePullCallback(pull, original!, `${context} has member 'pull' that`),
    start: start === undefined ?
      undefined :
      convertUnderlyingSourceStartCallback(start, original!, `${context} has member 'start' that`),
    type: type === undefined ? undefined : convertReadableStreamType(type, `${context} has member 'type' that`)
  };
}

function convertUnderlyingSourceCancelCallback(
  fn: UnderlyingSourceCancelCallback,
  original: UnderlyingDefaultOrByteSource,
  context: string
): (reason: any) => Promise<void> {
  assertFunction(fn, context);
  return (reason: any) => promiseCall(fn, original, [reason]);
}

function convertUnderlyingSourcePullCallback<R>(
  fn: UnderlyingDefaultOrByteSourcePullCallback<R>,
  original: UnderlyingDefaultOrByteSource<R>,
  context: string
): (controller: ReadableStreamController<R>) => Promise<void> {
  assertFunction(fn, context);
  return (controller: ReadableStreamController<R>) => promiseCall(fn, original, [controller]);
}

function convertUnderlyingSourceStartCallback<R>(
  fn: UnderlyingDefaultOrByteSourceStartCallback<R>,
  original: UnderlyingDefaultOrByteSource<R>,
  context: string
): UnderlyingDefaultOrByteSourceStartCallback<R> {
  assertFunction(fn, context);
  return (controller: ReadableStreamController<R>) => reflectCall(fn, original, [controller]);
}

function convertReadableStreamType(type: string, context: string): 'bytes' {
  type = `${type}`;
  if (type !== 'bytes') {
    throw new TypeError(`${context} '${type}' is not a valid enumeration value for ReadableStreamType`);
  }
  return type;
}
