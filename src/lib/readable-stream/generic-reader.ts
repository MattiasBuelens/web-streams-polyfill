import assert from '../../stub/assert';
import { ReadableStream, ReadableStreamCancel, ReadableStreamReader } from '../readable-stream';
import { newPromise, setPromiseIsHandledToTrue } from '../helpers/webidl';

export function ReadableStreamReaderGenericInitialize<R>(reader: ReadableStreamReader<R>, stream: ReadableStream<R>) {
  reader._ownerReadableStream = stream;
  stream._reader = reader;

  if (stream._state === 'readable') {
    defaultReaderClosedPromiseInitialize(reader);
  } else if (stream._state === 'closed') {
    defaultReaderClosedPromiseInitializeAsResolved(reader);
  } else {
    assert(stream._state === 'errored');

    defaultReaderClosedPromiseInitializeAsRejected(reader, stream._storedError);
  }
}

// A client of ReadableStreamDefaultReader and ReadableStreamBYOBReader may use these functions directly to bypass state
// check.

export function ReadableStreamReaderGenericCancel(reader: ReadableStreamReader<any>, reason: any): Promise<undefined> {
  const stream = reader._ownerReadableStream;
  assert(stream !== undefined);
  return ReadableStreamCancel(stream, reason);
}

export function ReadableStreamReaderGenericRelease(reader: ReadableStreamReader<any>) {
  assert(reader._ownerReadableStream !== undefined);
  assert(reader._ownerReadableStream._reader === reader);

  if (reader._ownerReadableStream._state === 'readable') {
    defaultReaderClosedPromiseReject(
      reader,
      new TypeError(`Reader was released and can no longer be used to monitor the stream's closedness`));
  } else {
    defaultReaderClosedPromiseResetToRejected(
      reader,
      new TypeError(`Reader was released and can no longer be used to monitor the stream's closedness`));
  }

  reader._ownerReadableStream._reader = undefined;
  reader._ownerReadableStream = undefined!;
}

// Helper functions for the readers.

export function readerLockException(name: string): TypeError {
  return new TypeError('Cannot ' + name + ' a stream using a released reader');
}

// Helper functions for the ReadableStreamDefaultReader.

export function defaultReaderClosedPromiseInitialize(reader: ReadableStreamReader<any>) {
  reader._closedPromise = newPromise((resolve, reject) => {
    reader._closedPromise_resolve = resolve;
    reader._closedPromise_reject = reject;
  });
}

export function defaultReaderClosedPromiseInitializeAsRejected(reader: ReadableStreamReader<any>, reason: any) {
  defaultReaderClosedPromiseInitialize(reader);
  defaultReaderClosedPromiseReject(reader, reason);
}

export function defaultReaderClosedPromiseInitializeAsResolved(reader: ReadableStreamReader<any>) {
  defaultReaderClosedPromiseInitialize(reader);
  defaultReaderClosedPromiseResolve(reader);
}

export function defaultReaderClosedPromiseReject(reader: ReadableStreamReader<any>, reason: any) {
  if (reader._closedPromise_reject === undefined) {
    return;
  }

  setPromiseIsHandledToTrue(reader._closedPromise);
  reader._closedPromise_reject(reason);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

export function defaultReaderClosedPromiseResetToRejected(reader: ReadableStreamReader<any>, reason: any) {
  assert(reader._closedPromise_resolve === undefined);
  assert(reader._closedPromise_reject === undefined);

  defaultReaderClosedPromiseInitializeAsRejected(reader, reason);
}

export function defaultReaderClosedPromiseResolve(reader: ReadableStreamReader<any>) {
  if (reader._closedPromise_resolve === undefined) {
    return;
  }

  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}
