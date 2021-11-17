import type { ReadableStreamState } from '../readable-stream';
import { IsReadableStream } from '../readable-stream';
import type { WritableStreamState } from '../writable-stream';
import { IsWritableStream, WritableStreamCloseQueuedOrInFlight } from '../writable-stream';
import type { ReadableStreamLike, WritableStreamLike } from '../helpers/stream-like';
import { IsReadableStreamLike, IsWritableStreamLike } from '../helpers/stream-like';
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

export function ReadableStreamPipeTo<T>(source: ReadableStreamLike<T>,
                                        dest: WritableStreamLike<T>,
                                        preventClose: boolean,
                                        preventAbort: boolean,
                                        preventCancel: boolean,
                                        signal: AbortSignal | undefined): Promise<undefined> {
  assert(IsReadableStreamLike(source));
  assert(IsWritableStreamLike(dest));
  assert(typeof preventClose === 'boolean');
  assert(typeof preventAbort === 'boolean');
  assert(typeof preventCancel === 'boolean');
  assert(signal === undefined || isAbortSignal(signal));
  assert(!source.locked);
  assert(!dest.locked);

  const reader = source.getReader();
  const writer = dest.getWriter();

  if (IsReadableStream(source)) {
    source._disturbed = true;
  }

  let shuttingDown = false;
  let released = false;
  let sourceState: ReadableStreamState = 'readable';
  let sourceStoredError: any;
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

    function handleSourceClose(): null {
      // Closing must be propagated forward
      assert(!released);
      assert(!IsReadableStream(source) || source._state === 'closed');
      sourceState = 'closed';
      if (!preventClose) {
        shutdownWithAction(() => {
          if (IsWritableStream(dest)) {
            destCloseRequested = WritableStreamCloseQueuedOrInFlight(dest);
            destState = dest._state;
          }
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
    }

    function handleSourceError(storedError: any): null {
      if (released) {
        return null;
      }
      // Errors must be propagated forward
      assert(!IsReadableStream(source) || source._state === 'errored');
      sourceState = 'errored';
      sourceStoredError = storedError;
      if (!preventAbort) {
        shutdownWithAction(() => writer.abort(storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    }

    function handleDestClose(): null {
      assert(!released);
      assert(!IsWritableStream(dest) || dest._state === 'closed');
      destState = 'closed';
      return null;
    }

    function handleDestError(storedError: any): null {
      if (released) {
        return null;
      }
      // Errors must be propagated backward
      assert(!IsWritableStream(dest) || dest._state === 'errored');
      destState = 'errored';
      destStoredError = storedError;
      if (!preventCancel) {
        shutdownWithAction(() => reader.cancel(storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
      return null;
    }

    // If we're using our own stream implementations, synchronously inspect their state.
    if (IsReadableStream(source)) {
      sourceState = source._state;
      sourceStoredError = source._storedError;
    }
    if (IsWritableStream(dest)) {
      destState = dest._state;
      destStoredError = dest._storedError;
      destCloseRequested = WritableStreamCloseQueuedOrInFlight(dest);
    }

    // Errors must be propagated forward
    if (sourceState === 'errored') {
      handleSourceError(sourceStoredError);
    }
    // Errors must be propagated backward
    if (destState === 'errored') {
      handleDestError(destStoredError);
    }
    // Closing must be propagated forward
    if (sourceState === 'closed') {
      handleSourceClose();
    }
    // Closing must be propagated backward
    if (destCloseRequested || destState === 'closed') {
      const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');
      if (!preventCancel) {
        shutdownWithAction(() => reader.cancel(destClosed), true, destClosed);
      } else {
        shutdown(true, destClosed);
      }
    }

    // Detect asynchronous state transitions.
    if (!shuttingDown) {
      uponPromise(reader.closed, handleSourceClose, handleSourceError);
      uponPromise(writer.closed, handleDestClose, handleDestError);
    }

    // If we synchronously inspected the stream's state, then we can start the loop immediately.
    // Otherwise, we give `reader.closed` or `writer.closed` a little bit of time to settle.
    if (IsReadableStream(source) && IsWritableStream(source)) {
      startPipeLoop();
    } else {
      queueMicrotask(startPipeLoop);
    }

    function startPipeLoop(): void {
      started = true;
      resolveStart();

      pipeLoop();
    }

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

    function shutdownWithAction(action: (() => Promise<unknown>) | undefined,
                                originalIsError?: boolean,
                                originalError?: any) {
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
        if (action) {
          uponPromise(
            action(),
            () => waitForReadsAndWritesThenFinalize(originalIsError, originalError),
            newError => waitForReadsAndWritesThenFinalize(true, newError)
          );
        } else {
          waitForReadsAndWritesThenFinalize(originalIsError, originalError);
        }
        return null;
      }
    }

    function shutdown(isError?: boolean, error?: any) {
      shutdownWithAction(undefined, isError, error);
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
