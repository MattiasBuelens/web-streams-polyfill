import type { ReadableStream, ReadableStreamState } from '../readable-stream';
import { IsReadableStream } from '../readable-stream';
import type { WritableStream, WritableStreamState } from '../writable-stream';
import { IsWritableStream } from '../writable-stream';
import assert from '../../stub/assert';
import {
  newPromise,
  PerformPromiseThen,
  promiseRejectedWith,
  promiseResolvedWith,
  queueMicrotask,
  setPromiseIsHandledToTrue,
  transformPromiseWith,
  uponFulfillment,
  uponPromise
} from '../helpers/webidl';
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
  let released = false;
  let sourceState: ReadableStreamState = 'readable';
  let destState: WritableStreamState = 'writable';
  let destStoredError: any;
  let destCloseRequested = false;

  // This is used to track when we initially start the pipe loop, and have initialized sourceState and destState.
  let started = false;
  let resolveStart: () => void;
  const startPromise: Promise<void> = newPromise(resolve => {
    resolveStart = resolve;
  });

  // This is used to keep track of the spec's requirement that we wait for ongoing reads and writes during shutdown.
  let currentRead = promiseResolvedWith<unknown>(undefined);
  let currentWrite = promiseResolvedWith<unknown>(undefined);

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
      } else {
        signal.addEventListener('abort', abortAlgorithm);
      }
    }

    // Using reader and writer, read all chunks from this and write them to dest
    // - Backpressure must be enforced
    // - Shutdown must stop all activity
    function pipeLoop() {
      if (shuttingDown) {
        return;
      }

      const loop = newPromise<void>((resolveLoop, rejectLoop) => {
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

      setPromiseIsHandledToTrue(loop);
    }

    function pipeStep(): Promise<boolean> {
      if (shuttingDown) {
        return promiseResolvedWith(true);
      }

      return PerformPromiseThen(writer.ready, () => {
        const read = PerformPromiseThen(reader.read(), result => {
          if (result.done) {
            return true;
          }
          currentWrite = writer.write(result.value);
          setPromiseIsHandledToTrue(currentWrite);
          return false;
        });
        currentRead = read;
        return read;
      });
    }

    uponPromise(reader.closed, () => {
      // Closing must be propagated forward
      assert(!released);
      assert(source._state === 'closed');
      sourceState = 'closed';
      if (!preventClose) {
        shutdownWithAction(() => {
          if (destCloseRequested || destState === 'closed') {
            return promiseResolvedWith(undefined);
          }
          if (destState === 'errored') {
            return promiseRejectedWith(destStoredError);
          }
          assert(destState === 'writable' || destState === 'erroring');
          destCloseRequested = true;
          return writer.close();
        });
      } else {
        shutdown();
      }
      return null;
    }, storedError => {
      if (released) {
        return null;
      }
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
      assert(!released);
      assert(dest._state === 'closed');
      destState = 'closed';
      return null;
    }, storedError => {
      if (released) {
        return null;
      }
      // Errors must be propagated backward
      assert(dest._state === 'errored');
      destState = 'errored';
      destStoredError = storedError;
      if (!preventCancel) {
        shutdownWithAction(() => reader.cancel(storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    });

    queueMicrotask(() => {
      started = true;
      resolveStart();

      // Closing must be propagated backward
      // FIXME The reference implementation does this synchronously, and expects it to take affect
      //  *before* any of the error propagations above... :-/
      if (destCloseRequested || destState === 'closed') {
        const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

        if (!preventCancel) {
          shutdownWithAction(() => reader.cancel(destClosed), true, destClosed);
        } else {
          shutdown(true, destClosed);
        }
      }

      pipeLoop();
    });

    function waitForWritesToFinish(): Promise<void> {
      let oldCurrentWrite: Promise<unknown> | undefined;
      return promiseResolvedWith(check());

      function check(): undefined | Promise<undefined> {
        // Another write may have started while we were waiting on this currentWrite,
        // so we have to be sure to wait for that too.
        if (oldCurrentWrite !== currentWrite) {
          oldCurrentWrite = currentWrite;
          return transformPromiseWith(currentWrite, check, check);
        }
        return undefined;
      }
    }

    function waitForReadsAndWritesToFinish(): Promise<void> {
      let oldCurrentRead: Promise<unknown> | undefined;
      let oldCurrentWrite: Promise<unknown> | undefined;
      return promiseResolvedWith(check());

      function check(): undefined | Promise<undefined> {
        // Another read or write may have started while we were waiting on this currentRead or currentWrite,
        // so we have to be sure to wait for that too.
        if (oldCurrentRead !== currentRead) {
          oldCurrentRead = currentRead;
          return transformPromiseWith(currentRead, check, check);
        }
        if (oldCurrentWrite !== currentWrite) {
          oldCurrentWrite = currentWrite;
          return transformPromiseWith(currentWrite, check, check);
        }
        return undefined;
      }
    }

    function shutdownWithAction(action: () => Promise<unknown>, originalIsError?: boolean, originalError?: any) {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      if (!started) {
        uponFulfillment(startPromise, onStart);
      } else {
        onStart();
      }

      function onStart(): null {
        uponFulfillment(waitForWritesToFinish(), doTheRest);
        return null;
      }

      function doTheRest(): null {
        uponPromise(
          action(),
          () => waitForReadsAndWritesThenFinalize(originalIsError, originalError),
          newError => waitForReadsAndWritesThenFinalize(true, newError)
        );
        return null;
      }
    }

    function shutdown(isError?: boolean, error?: any) {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      if (!started) {
        uponFulfillment(startPromise, onStart);
      } else {
        onStart();
      }

      function onStart(): null {
        waitForReadsAndWritesThenFinalize(isError, error);
        return null;
      }
    }

    function waitForReadsAndWritesThenFinalize(isError?: boolean, error?: any): null {
      uponFulfillment(waitForReadsAndWritesToFinish(), () => finalize(isError, error));
      return null;
    }

    function finalize(isError?: boolean, error?: any): null {
      released = true;
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
