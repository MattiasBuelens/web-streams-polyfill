import assert from '../../stub/assert';
import { ReadableStream, ReadableStreamCancel, type ReadableStreamReader } from '../readable-stream';
import { newPromise, promiseRejectedWith, promiseResolve, setPromiseIsHandledToTrue } from '../helpers/webidl';
import { ReleaseSteps } from '../abstract-ops/internal-methods';

export function ReadableStreamReaderGenericInitialize<R>(reader: ReadableStreamReader<R>, stream: ReadableStream<R>) {
  reader._ownerReadableStream = stream;
  stream._reader = reader;

  // The closed promise is created lazily by readerClosedPromise.
  reader._closedPromise = undefined;
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

// A client of ReadableStreamDefaultReader and ReadableStreamBYOBReader may use these functions directly to bypass state
// check.

export function ReadableStreamReaderGenericCancel(reader: ReadableStreamReader<any>, reason: any): Promise<undefined> {
  const stream = reader._ownerReadableStream;
  assert(stream !== undefined);
  return ReadableStreamCancel(stream, reason);
}

export function ReadableStreamReaderGenericRelease(reader: ReadableStreamReader<any>) {
  const stream = reader._ownerReadableStream;
  assert(stream !== undefined);
  assert(stream._reader === reader);

  if (stream._state === 'readable') {
    if (reader._closedPromise !== undefined) {
      const e = readerReleasedException();
      readerClosedPromiseReject(reader, e);
    } else {
      // Do nothing. readerClosedPromise will create the rejected promise on first access.
    }
  } else {
    // Reset the promise. readerClosedPromise will re-create the rejected promise on the next access.
    readerClosedPromiseReset(reader);
  }

  stream._readableStreamController[ReleaseSteps]();

  stream._reader = undefined;
  reader._ownerReadableStream = undefined!;
}

// Helper functions for the readers.

export function readerLockException(name: string): TypeError {
  return new TypeError('Cannot ' + name + ' a stream using a released reader');
}

export function readerReleasedException(): TypeError {
  return new TypeError('Reader was released');
}

// Helper functions for the ReadableStreamDefaultReader.

export function readerClosedPromise(reader: ReadableStreamReader<any>): Promise<undefined> {
  if (reader._closedPromise === undefined) {
    assert(reader._closedPromise_resolve === undefined);
    assert(reader._closedPromise_reject === undefined);
    const stream = reader._ownerReadableStream;
    if (stream === undefined) {
      // Reader has been released.
      reader._closedPromise = promiseRejectedWith(readerReleasedException());
      setPromiseIsHandledToTrue(reader._closedPromise);
    } else {
      switch (stream._state) {
        case 'readable':
          reader._closedPromise = newPromise((resolve, reject) => {
            reader._closedPromise_resolve = resolve;
            reader._closedPromise_reject = reject;
          });
          break;
        case 'closed':
          reader._closedPromise = promiseResolve(undefined);
          break;
        case 'errored':
          reader._closedPromise = promiseRejectedWith(stream._storedError);
          setPromiseIsHandledToTrue(reader._closedPromise);
          break;
      }
    }
  }
  return reader._closedPromise;
}

export function readerClosedPromiseReject(reader: ReadableStreamReader<any>, reason: any) {
  if (reader._closedPromise_reject === undefined) {
    // If closed promise isn't created yet, skip. readerClosedPromise will set it to a rejected promise on first access.
    // If already resolved/rejected, rejecting it again is a no-op.
    return;
  }
  assert(reader._closedPromise !== undefined);
  setPromiseIsHandledToTrue(reader._closedPromise);
  reader._closedPromise_reject(reason);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

export function readerClosedPromiseReset(reader: ReadableStreamReader<any>) {
  reader._closedPromise = undefined;
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

export function readerClosedPromiseResolve(reader: ReadableStreamReader<any>) {
  if (reader._closedPromise_resolve === undefined) {
    // If closed promise isn't created yet, skip. readerClosedPromise will set it to a resolved promise on first access.
    // If already resolved/rejected, resolving it again is a no-op.
    return;
  }
  assert(reader._closedPromise !== undefined);
  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}
