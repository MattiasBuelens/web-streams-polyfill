import { IsReadableStream, IsReadableStreamLocked, ReadableStream, ReadableStreamCancel } from '../readable-stream';
import { AcquireReadableStreamDefaultReader, ReadableStreamDefaultReaderRead } from './default-reader';
import { ReadableStreamReaderGenericRelease } from './generic-reader';
import {
  AcquireWritableStreamDefaultWriter,
  IsWritableStream,
  IsWritableStreamLocked,
  WritableStream,
  WritableStreamAbort,
  WritableStreamCloseQueuedOrInFlight,
  WritableStreamDefaultWriterCloseWithErrorPropagation,
  WritableStreamDefaultWriterRelease,
  WritableStreamDefaultWriterWrite
} from '../writable-stream';
import assert from '../../stub/assert';
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
import { AbortSignal, isAbortSignal } from '../abort-signal';
import { DOMException } from '../../stub/dom-exception';

export function ReadableStreamPipeTo<T>(source: ReadableStream<T>,
                                        dest: WritableStream<T>,
                                        preventClose: boolean,
                                        preventAbort: boolean,
                                        preventCancel: boolean,
                                        signal: AbortSignal | undefined): Promise<undefined> {
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

  let shuttingDown = false;

  // This is used to keep track of the spec's requirement that we wait for ongoing writes during shutdown.
  let currentWrite = promiseResolvedWith<void>(undefined);

  return newPromise((resolve, reject) => {
    let abortAlgorithm: () => void;
    if (signal !== undefined) {
      abortAlgorithm = () => {
        const error = new DOMException('Aborted', 'AbortError');
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
      if (shuttingDown) {
        return promiseResolvedWith(true);
      }

      return PerformPromiseThen(writer._readyPromise, () => {
        return newPromise<boolean>((resolveRead, rejectRead) => {
          ReadableStreamDefaultReaderRead(
            reader,
            {
              _chunkSteps: chunk => {
                currentWrite = PerformPromiseThen(WritableStreamDefaultWriterWrite(writer, chunk), undefined, noop);
                resolveRead(false);
              },
              _closeSteps: () => resolveRead(true),
              _errorSteps: rejectRead
            }
          );
        });
      });
    }

    // Errors must be propagated forward
    isOrBecomesErrored(source, reader._closedPromise, storedError => {
      if (!preventAbort) {
        shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
    });

    // Errors must be propagated backward
    isOrBecomesErrored(dest, writer._closedPromise, storedError => {
      if (!preventCancel) {
        shutdownWithAction(() => ReadableStreamCancel(source, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
    });

    // Closing must be propagated forward
    isOrBecomesClosed(source, reader._closedPromise, () => {
      if (!preventClose) {
        shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
      } else {
        shutdown();
      }
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

    function waitForWritesToFinish(): Promise<void> {
      // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
      // for that too.
      const oldCurrentWrite = currentWrite;
      return PerformPromiseThen(
        currentWrite,
        () => oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : undefined
      );
    }

    function isOrBecomesErrored(stream: ReadableStream | WritableStream,
                                promise: Promise<void>,
                                action: (reason: any) => void) {
      if (stream._state === 'errored') {
        action(stream._storedError);
      } else {
        uponRejection(promise, action);
      }
    }

    function isOrBecomesClosed(stream: ReadableStream | WritableStream, promise: Promise<void>, action: () => void) {
      if (stream._state === 'closed') {
        action();
      } else {
        uponFulfillment(promise, action);
      }
    }

    function shutdownWithAction(action: () => Promise<unknown>, originalIsError?: boolean, originalError?: any) {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
        uponFulfillment(waitForWritesToFinish(), doTheRest);
      } else {
        doTheRest();
      }

      function doTheRest() {
        uponPromise(
          action(),
          () => finalize(originalIsError, originalError),
          newError => finalize(true, newError)
        );
      }
    }

    function shutdown(isError?: boolean, error?: any) {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
        uponFulfillment(waitForWritesToFinish(), () => finalize(isError, error));
      } else {
        finalize(isError, error);
      }
    }

    function finalize(isError?: boolean, error?: any) {
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
    }
  });
}
