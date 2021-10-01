import type { ReadableStream, ReadableStreamState } from '../readable-stream';
import { IsReadableStream } from '../readable-stream';
import type { WritableStream, WritableStreamState } from '../writable-stream';
import {
  IsWritableStream,
  WritableStreamCloseQueuedOrInFlight,
  WritableStreamDefaultWriterCloseWithErrorPropagation
} from '../writable-stream';
import assert from '../../stub/assert';
import {
  newPromise,
  PerformPromiseThen,
  promiseResolvedWith,
  queueMicrotask,
  setPromiseIsHandledToTrue,
  uponFulfillment,
  uponPromise
} from '../helpers/webidl';
import { noop } from '../../utils';
import type { AbortSignal } from '../abort-signal';
import { isAbortSignal } from '../abort-signal';
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
  assert(!source.locked);
  assert(!dest.locked);

  const reader = source.getReader();
  const writer = dest.getWriter();

  source._disturbed = true;

  let shuttingDown = false;
  let sourceState: ReadableStreamState = 'readable';
  let destState: WritableStreamState = 'writable';

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
            if (destState === 'writable') {
              return writer.abort(error);
            }
            return promiseResolvedWith(undefined);
          });
        }
        if (!preventCancel) {
          actions.push(() => {
            if (sourceState === 'readable') {
              return reader.cancel(error);
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

      return PerformPromiseThen(writer.ready, () => {
        return PerformPromiseThen(reader.read(), result => {
          if (result.done) {
            return true;
          }
          currentWrite = PerformPromiseThen(writer.write(result.value), undefined, noop);
          return false;
        });
      });
    }

    uponPromise(reader.closed, () => {
      // Closing must be propagated forward
      assert(source._state === 'closed');
      sourceState = 'closed';
      if (!preventClose) {
        shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
      } else {
        shutdown();
      }
      return null;
    }, storedError => {
      // Errors must be propagated forward
      assert(source._state === 'errored');
      sourceState = 'errored';
      if (!preventAbort) {
        shutdownWithAction(() => writer.abort(storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    });

    uponPromise(writer.closed, () => {
      assert(dest._state === 'closed');
      destState = 'closed';
      return null;
    }, storedError => {
      // Errors must be propagated backward
      assert(dest._state === 'errored');
      destState = 'errored';
      if (!preventCancel) {
        shutdownWithAction(() => reader.cancel(storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    });

    queueMicrotask(() => {
      // Closing must be propagated backward
      if (WritableStreamCloseQueuedOrInFlight(dest) || destState === 'closed') {
        const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

        if (!preventCancel) {
          shutdownWithAction(() => reader.cancel(destClosed), true, destClosed);
        } else {
          shutdown(true, destClosed);
        }
      }

      setPromiseIsHandledToTrue(pipeLoop());
    });

    function waitForWritesToFinish(): Promise<void> {
      // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
      // for that too.
      const oldCurrentWrite = currentWrite;
      return PerformPromiseThen(
        currentWrite,
        () => oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : undefined
      );
    }

    function shutdownWithAction(action: () => Promise<unknown>, originalIsError?: boolean, originalError?: any) {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      if (destState === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
        uponFulfillment(waitForWritesToFinish(), doTheRest);
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
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      if (destState === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
        uponFulfillment(waitForWritesToFinish(), () => finalize(isError, error));
      } else {
        finalize(isError, error);
      }
    }

    function finalize(isError?: boolean, error?: any): null {
      writer.releaseLock();
      reader.releaseLock();

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
