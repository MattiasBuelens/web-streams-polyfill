import { IsReadableStream, IsReadableStreamLocked, ReadableStream, ReadableStreamCancel } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReaderCanReadSync,
  ReadableStreamDefaultReaderRead,
  type ReadRequest
} from './default-reader';
import { ReadableStreamReaderGenericRelease, readerSetStateChangeListener } from './generic-reader';
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
  WritableStreamDefaultWriterWriteWithRequest,
  type WriteRequest,
  writerReadyPromise,
  writerSetStateChangeListener
} from '../writable-stream';
import assert, { unexpected } from '../../stub/assert';
import {
  newPromise,
  PerformPromiseThen,
  promiseResolvedWith,
  setPromiseIsHandledToTrue,
  uponFulfillment,
  uponPromise
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
        // Resume through pipeLoop instead of recursively adopting the next step's promise.
        // Otherwise, repeated backpressure retains a promise chain until the pipe finishes.
        return PerformPromiseThen(writerReadyPromise(writer), () => false);
      }
      const request = new PipeReadRequest(state);
      ReadableStreamDefaultReaderRead(reader, request);
      return request._promise;
    }

    // Errors must be propagated forward
    function sourceErrored(storedError: any) {
      if (!preventAbort) {
        shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
    }

    // Errors must be propagated backward
    function destErrored(storedError: any) {
      if (!preventCancel) {
        shutdownWithAction(() => ReadableStreamCancel(source, storedError), true, storedError);
      } else {
        shutdown(true, storedError);
      }
    }

    // Closing must be propagated forward
    function sourceClosed() {
      if (!preventClose) {
        shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
      } else {
        shutdown();
      }
    }

    if (source._state === 'errored') {
      sourceErrored(source._storedError);
    }
    if (dest._state === 'errored') {
      destErrored(dest._storedError);
    }
    if (source._state === 'closed') {
      sourceClosed();
    }

    // Closing must be propagated backward
    if (WritableStreamCloseQueuedOrInFlight(dest) || dest._state === 'closed') {
      const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

      if (!preventCancel) {
        shutdownWithAction(() => ReadableStreamCancel(source, destClosed), true, destClosed);
      } else {
        shutdown(true, destClosed);
      }
    }

    if (!state._shuttingDown) {
      watchForStateChanges();
      setPromiseIsHandledToTrue(pipeLoop());
    }

    // Instead of reacting to the closed promises of the reader and the writer (which would need to be materialized
    // and then rejected again on release), listen for state changes directly. The first change settles a single
    // promise that the pipe reacts to, so the shutdown steps still run in the same microtask as a reaction on
    // the closed promise would have, and in the async context of the pipeTo() call.
    function watchForStateChanges() {
      let stateChangeSteps: (() => void) | undefined;
      let resolveStateChange!: () => void;
      const stateChangePromise = newPromise<void>((resolveFn) => {
        resolveStateChange = resolveFn;
      });
      uponFulfillment(stateChangePromise, () => {
        stateChangeSteps!();
        return null;
      });

      function onStateChange(steps: () => void) {
        if (stateChangeSteps !== undefined) {
          // Already notified. The shutdown steps of the first change win, as with separate promise reactions.
          return;
        }
        stateChangeSteps = steps;
        resolveStateChange();
      }

      if (source._state === 'readable') {
        readerSetStateChangeListener(reader, () => {
          if (source._state === 'errored') {
            const storedError = source._storedError;
            onStateChange(() => sourceErrored(storedError));
          } else {
            assert(source._state === 'closed');
            onStateChange(sourceClosed);
          }
        });
      }
      if (dest._state === 'writable' || dest._state === 'erroring') {
        writerSetStateChangeListener(writer, () => {
          assert(dest._state === 'errored');
          const storedError = dest._storedError;
          onStateChange(() => destErrored(storedError));
        });
      }
    }

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
  // In the specification, currentWrite is the last write's promise transformed with a no-op rejection handler,
  // so it fulfills one microtask after the last write settles.
  // Optimization: instead of creating these promises for every write, we track writes with lightweight
  // write requests, and only materialize currentWrite when the pipe starts shutting down.
  _currentWrite: Promise<void> | undefined = undefined;
  // The number of the last write, and whether it has settled.
  _lastWrite = 0;
  _lastWriteSettled = true;
  // The number of pending microtasks that stand in for the reactions that would settle currentWrite.
  _pendingSettleTicks = 0;
  // Resolves the materialized currentWrite (or the promise it is derived from).
  _resolveCurrentWrite: (() => void) | undefined = undefined;
  readonly _settleTick: () => null;

  constructor(readonly _writer: WritableStreamDefaultWriter<T>) {
    this._settleTick = () => {
      this._pendingSettleTicks--;
      if (this._pendingSettleTicks === 0 && this._lastWriteSettled) {
        this._runResolveCurrentWrite();
      }
      return null;
    };
  }

  _write(chunk: T): void {
    if (this._currentWrite !== undefined) {
      // Already waiting for writes to finish (e.g. a pending read was fulfilled during shutdown).
      // Track this write with a promise, exactly like the specification.
      this._currentWrite = PerformPromiseThen(
        WritableStreamDefaultWriterWrite(this._writer, chunk),
        undefined,
        noop
      );
      return;
    }
    const writeNumber = ++this._lastWrite;
    this._lastWriteSettled = false;
    WritableStreamDefaultWriterWriteWithRequest(this._writer, chunk, new PipeWriteRequest(this, writeNumber));
  }

  _writeSettled(writeNumber: number): void {
    if (writeNumber !== this._lastWrite) {
      return;
    }
    this._lastWriteSettled = true;
    if (this._currentWrite !== undefined) {
      // currentWrite is derived from a promise that settles now.
      this._runResolveCurrentWrite();
      return;
    }
    // Stand in for the reaction that would settle currentWrite one microtask from now.
    this._pendingSettleTicks++;
    PerformPromiseThen(resolvedPromise, this._settleTick);
  }

  _runResolveCurrentWrite(): void {
    const resolveCurrentWrite = this._resolveCurrentWrite;
    if (resolveCurrentWrite !== undefined) {
      this._resolveCurrentWrite = undefined;
      resolveCurrentWrite();
    }
  }

  _waitForWritesToFinish(): Promise<void> {
    if (this._currentWrite === undefined) {
      // Materialize currentWrite, settling at the same time as in the specification.
      if (!this._lastWriteSettled) {
        // The last write is still pending: settle one microtask after it does.
        this._currentWrite = PerformPromiseThen(
          newPromise<void>((resolveFn) => {
            this._resolveCurrentWrite = resolveFn;
          }),
          undefined,
          noop
        );
      } else if (this._pendingSettleTicks > 0) {
        // The last write has just settled: settle when its stand-in reaction runs.
        this._currentWrite = newPromise<void>((resolveFn) => {
          this._resolveCurrentWrite = resolveFn;
        });
      } else {
        this._currentWrite = resolvedPromise;
      }
    }
    // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
    // for that too.
    const oldCurrentWrite = this._currentWrite;
    return PerformPromiseThen(
      oldCurrentWrite,
      () => oldCurrentWrite !== this._currentWrite ? this._waitForWritesToFinish() : undefined
    );
  }
}

const resolvedPromise = promiseResolvedWith<void>(undefined);

class PipeWriteRequest<T> implements WriteRequest {
  constructor(private readonly _state: PipeState<T>, private readonly _writeNumber: number) {}

  _resolve() {
    this._state._writeSettled(this._writeNumber);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _reject(_reason: any) {
    this._state._writeSettled(this._writeNumber);
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
    this._state._write(chunk);
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
    this._state._write(chunk);
  }

  _closeSteps() {
    unexpected();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _errorSteps(_error: any) {
    unexpected();
  }
}
