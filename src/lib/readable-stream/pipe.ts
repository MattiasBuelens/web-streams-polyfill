import { IsReadableStream, IsReadableStreamLocked, ReadableStream, ReadableStreamCancel } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReaderCanReadSync,
  ReadableStreamDefaultReaderRead,
  type ReadRequest
} from './default-reader';
import { ReadableStreamReaderGenericRelease, readerClosedPromise } from './generic-reader';
import {
  AcquireWritableStreamDefaultWriter,
  IsWritableStream,
  IsWritableStreamLocked,
  WritableStream,
  WritableStreamAbort,
  WritableStreamCloseQueuedOrInFlight,
  WritableStreamDefaultWriter,
  WritableStreamDefaultWriterCloseWithErrorPropagation,
  WritableStreamDefaultWriterRelease,
  WritableStreamDefaultWriterWrite,
  writerClosedPromise
} from '../writable-stream';
import assert, { unexpected } from '../../stub/assert';
import {
  newPromise,
  PerformPromiseThen,
  promiseResolvedWith,
  setPromiseIsHandledToTrue,
  uponFulfillment,
  uponPromise,
  uponRejection
} from '../helpers/webidl';
import { noop } from '../../utils';
import { type AbortSignal, isAbortSignal } from '../abort-signal';
import { DOMException } from '../../stub/dom-exception';

export function ReadableStreamPipeTo<T>(
  source: ReadableStream<T>,
  dest: WritableStream<T>,
  preventClose: boolean,
  preventAbort: boolean,
  preventCancel: boolean,
  signal: AbortSignal | undefined
): Promise<undefined> {
  assert(IsReadableStream(source));
  assert(IsWritableStream(dest));
  assert(typeof preventClose === 'boolean');
  assert(typeof preventAbort === 'boolean');
  assert(typeof preventCancel === 'boolean');
  assert(signal === undefined || isAbortSignal(signal));
  assert(!IsReadableStreamLocked(source));
  assert(!IsWritableStreamLocked(dest));

  const reader = AcquireReadableStreamDefaultReader<T>(source);
  const writer = AcquireWritableStreamDefaultWriter<T>(dest);

  source._disturbed = true;

  const state = new PipeState<T>(writer);
  const syncReadRequest = new SyncPipeReadRequest<T>(state);

  return newPromise((resolve, reject) => {
    let abortAlgorithm: () => void;
    if (signal !== undefined) {
      abortAlgorithm = () => {
        const error = signal.reason !== undefined ? signal.reason : new DOMException('Aborted', 'AbortError');
        const actions: Array<() => Promise<void>> = [];
        if (!preventAbort) {
          actions.push(() => {
            if (dest._state === 'writable') {
              return WritableStreamAbort(dest, error);
            }
            return promiseResolvedWith(undefined);
          });
        }
        if (!preventCancel) {
          actions.push(() => {
            if (source._state === 'readable') {
              return ReadableStreamCancel(source, error);
            }
            return promiseResolvedWith(undefined);
          });
        }
        shutdownWithAction(() => Promise.all(actions.map(action => action())), true, error);
      };

      if (signal.aborted) {
        abortAlgorithm();
        return;
      }

      signal.addEventListener('abort', abortAlgorithm);
    }

    // Using reader and writer, read all chunks from this and write them to dest
    // - Backpressure must be enforced
    // - Shutdown must stop all activity
    function pipeLoop() {
      return newPromise<void>((resolveLoop, rejectLoop) => {
        function next(done: boolean) {
          if (done) {
            resolveLoop();
          } else {
            // Use `PerformPromiseThen` instead of `uponPromise` to avoid
            // adding unnecessary `.catch(rethrowAssertionErrorRejection)` handlers
            PerformPromiseThen(pipeStep(), next, rejectLoop);
          }
        }

        next(false);
      });
    }

    function pipeStep(): Promise<boolean> {
      // Fast path: read available chunks synchronously in a single batch
      while (
        !state._shuttingDown
        && !dest._backpressure
        && dest._state === 'writable'
        && !WritableStreamCloseQueuedOrInFlight(dest)
        && source._state === 'readable'
        && ReadableStreamDefaultReaderCanReadSync(reader)
      ) {
        ReadableStreamDefaultReaderRead(reader, syncReadRequest);
      }

      // Slow path: wait for chunk to become available
      if (state._shuttingDown) {
        return promiseResolvedWith(true);
      }
      if (dest._backpressure) {
        return PerformPromiseThen(writer._readyPromise, pipeStep);
      }
      const request = new PipeReadRequest(state);
      ReadableStreamDefaultReaderRead(reader, request);
      return request._promise;
    }

    // Errors must be propagated forward
    isOrBecomesErrored(source, readerClosedPromise(reader), (storedError) => {
      if (!preventAbort) {
        shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    });

    // Errors must be propagated backward
    isOrBecomesErrored(dest, writerClosedPromise(writer), (storedError) => {
      if (!preventCancel) {
        shutdownWithAction(() => ReadableStreamCancel(source, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    });

    // Closing must be propagated forward
    isOrBecomesClosed(source, readerClosedPromise(reader), () => {
      if (!preventClose) {
        shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
      } else {
        shutdown();
      }
      return null;
    });

    // Closing must be propagated backward
    if (WritableStreamCloseQueuedOrInFlight(dest) || dest._state === 'closed') {
      const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

      if (!preventCancel) {
        shutdownWithAction(() => ReadableStreamCancel(source, destClosed), true, destClosed);
      } else {
        shutdown(true, destClosed);
      }
    }

    setPromiseIsHandledToTrue(pipeLoop());

    function shutdownWithAction(action: () => Promise<unknown>, originalIsError?: boolean, originalError?: any) {
      if (state._shuttingDown) {
        return;
      }
      state._shuttingDown = true;

      if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
        uponFulfillment(state._waitForWritesToFinish(), doTheRest);
      } else {
        doTheRest();
      }

      function doTheRest(): null {
        uponPromise(
          action(),
          () => finalize(originalIsError, originalError),
          newError => finalize(true, newError)
        );
        return null;
      }
    }

    function shutdown(isError?: boolean, error?: any) {
      if (state._shuttingDown) {
        return;
      }
      state._shuttingDown = true;

      if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
        uponFulfillment(state._waitForWritesToFinish(), () => finalize(isError, error));
      } else {
        finalize(isError, error);
      }
    }

    function finalize(isError?: boolean, error?: any): null {
      WritableStreamDefaultWriterRelease(writer);
      ReadableStreamReaderGenericRelease(reader);

      if (signal !== undefined) {
        signal.removeEventListener('abort', abortAlgorithm);
      }
      if (isError) {
        reject(error);
      } else {
        resolve(undefined);
      }

      return null;
    }
  });
}

class PipeState<T> {
  _shuttingDown = false;

  // This is used to keep track of the spec's requirement that we wait for ongoing writes during shutdown.
  _currentWrite = promiseResolvedWith<void>(undefined);

  constructor(readonly _writer: WritableStreamDefaultWriter<T>) {}

  _waitForWritesToFinish(): Promise<void> {
    // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
    // for that too.
    const oldCurrentWrite = this._currentWrite;
    return PerformPromiseThen(
      this._currentWrite,
      () => oldCurrentWrite !== this._currentWrite ? this._waitForWritesToFinish() : undefined
    );
  }
}

class PipeReadRequest<T> implements ReadRequest<T> {
  readonly _state: PipeState<T>;

  readonly _promise: Promise<boolean>;
  private _resolvePromise!: (done: boolean) => void;
  private _rejectPromise!: (reason: any) => void;

  constructor(state: PipeState<T>) {
    this._state = state;
    this._promise = newPromise((resolve, reject) => {
      this._resolvePromise = resolve;
      this._rejectPromise = reject;
    });
  }

  _chunkSteps(chunk: T) {
    this._state._currentWrite = PerformPromiseThen(
      WritableStreamDefaultWriterWrite(this._state._writer, chunk),
      undefined,
      noop
    );
    this._resolvePromise(false);
  }

  _closeSteps() {
    this._resolvePromise(true);
  }

  _errorSteps(e: any) {
    this._rejectPromise(e);
  }
}

class SyncPipeReadRequest<T> implements ReadRequest<T> {
  constructor(private _state: PipeState<T>) { }

  _chunkSteps(chunk: T) {
    this._state._currentWrite = PerformPromiseThen(
      WritableStreamDefaultWriterWrite(this._state._writer, chunk),
      undefined,
      noop
    );
  }

  _closeSteps() {
    unexpected();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _errorSteps(_error: any) {
    unexpected();
  }
}

function isOrBecomesErrored(
  stream: ReadableStream | WritableStream,
  promise: Promise<void>,
  action: (reason: any) => null
) {
  if (stream._state === 'errored') {
    action(stream._storedError);
  } else {
    uponRejection(promise, action);
  }
}

function isOrBecomesClosed(stream: ReadableStream | WritableStream, promise: Promise<void>, action: () => null) {
  if (stream._state === 'closed') {
    action();
  } else {
    uponFulfillment(promise, action);
  }
}
