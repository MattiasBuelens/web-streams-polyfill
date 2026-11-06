import { IsReadableStream, IsReadableStreamLocked, ReadableStream, ReadableStreamCancel } from '../readable-stream';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReaderCanReadSync,
  ReadableStreamDefaultReader,
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

  return newPromise((resolve, reject) => {
    const engine = new PipeEngine<T>(
      source,
      dest,
      reader,
      writer,
      preventClose,
      preventAbort,
      preventCancel,
      signal,
      resolve,
      reject
    );
    engine._start();
  });
}

type StateChange = 'none' | 'source-errored' | 'source-closed' | 'dest-errored';

const resolvedPromise = promiseResolvedWith<void>(undefined);
const resolvedTruePromise = promiseResolvedWith(true);
const returnFalse = () => false;

/**
 * Holds all state of a single pipeTo() operation.
 *
 * The specification describes the pipe with many promises and closures. To keep allocations down,
 * the engine keeps that state in fields, and acts as its own read request and write tracker.
 * Callbacks that are needed for every chunk are created once per pipe.
 * Every promise reaction is still registered at the same time (and thus in the same async context)
 * as in the specification, so the pipe runs on exactly the same microtask ticks.
 */
class PipeEngine<T> implements ReadRequest<T> {
  readonly _source: ReadableStream<T>;
  readonly _dest: WritableStream<T>;
  readonly _reader: ReadableStreamDefaultReader<T>;
  readonly _writer: WritableStreamDefaultWriter<T>;
  readonly _preventClose: boolean;
  readonly _preventAbort: boolean;
  readonly _preventCancel: boolean;
  readonly _signal: AbortSignal | undefined;
  _abortAlgorithm: (() => void) | undefined = undefined;
  readonly _resolve: (value: undefined) => void;
  readonly _reject: (reason: any) => void;

  _shuttingDown = false;
  // The action to perform while shutting down, and the error to shut down with (if any).
  _shutdownAction: ((this: PipeEngine<T>) => Promise<unknown>) | undefined = undefined;
  _shutdownIsError = false;
  _shutdownError: any = undefined;

  // The pipe loop.
  _resolveLoop!: () => void;
  _rejectLoop!: (reason: any) => void;
  readonly _next: (done: boolean) => void;
  // The pending read of the current pipe step, if any.
  _resolveStep: ((done: boolean) => void) | undefined = undefined;
  _rejectStep: ((reason: any) => void) | undefined = undefined;
  readonly _stepExecutor: (resolve: (done: boolean) => void, reject: (reason: any) => void) => void;

  // The first state change of the source or the destination.
  _stateChange: StateChange = 'none';
  _stateChangeError: any = undefined;
  _resolveStateChange: (() => void) | undefined = undefined;

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

  constructor(
    source: ReadableStream<T>,
    dest: WritableStream<T>,
    reader: ReadableStreamDefaultReader<T>,
    writer: WritableStreamDefaultWriter<T>,
    preventClose: boolean,
    preventAbort: boolean,
    preventCancel: boolean,
    signal: AbortSignal | undefined,
    resolve: (value: undefined) => void,
    reject: (reason: any) => void
  ) {
    this._source = source;
    this._dest = dest;
    this._reader = reader;
    this._writer = writer;
    this._preventClose = preventClose;
    this._preventAbort = preventAbort;
    this._preventCancel = preventCancel;
    this._signal = signal;
    this._resolve = resolve;
    this._reject = reject;
    this._next = (done) => {
      if (done) {
        this._resolveLoop();
      } else {
        // Use `PerformPromiseThen` instead of `uponPromise` to avoid
        // adding unnecessary `.catch(rethrowAssertionErrorRejection)` handlers
        PerformPromiseThen(this._pipeStep(), this._next, this._rejectLoop);
      }
    };
    this._stepExecutor = (resolveStep, rejectStep) => {
      this._resolveStep = resolveStep;
      this._rejectStep = rejectStep;
    };
    this._settleTick = () => {
      this._pendingSettleTicks--;
      if (this._pendingSettleTicks === 0 && this._lastWriteSettled) {
        this._runResolveCurrentWrite();
      }
      return null;
    };
  }

  _start(): void {
    const source = this._source;
    const dest = this._dest;
    const signal = this._signal;

    if (signal !== undefined) {
      const abortAlgorithm = this._abortAlgorithm = () => this._abort();
      if (signal.aborted) {
        abortAlgorithm();
        return;
      }
      signal.addEventListener('abort', abortAlgorithm);
    }

    if (source._state === 'errored') {
      this._sourceErrored(source._storedError);
    }
    if (dest._state === 'errored') {
      this._destErrored(dest._storedError);
    }
    if (source._state === 'closed') {
      this._sourceClosed();
    }

    // Closing must be propagated backward
    if (WritableStreamCloseQueuedOrInFlight(dest) || dest._state === 'closed') {
      const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

      if (!this._preventCancel) {
        this._shutdownWithAction(this._cancelSource, true, destClosed);
      } else {
        this._shutdown(true, destClosed);
      }
    }

    if (!this._shuttingDown) {
      this._watchForStateChanges();
      setPromiseIsHandledToTrue(this._pipeLoop());
    }
  }

  _abort(): void {
    const signal = this._signal!;
    const error = signal.reason !== undefined ? signal.reason : new DOMException('Aborted', 'AbortError');
    this._shutdownWithAction(this._abortDestAndCancelSource, true, error);
  }

  // Using reader and writer, read all chunks from this and write them to dest
  // - Backpressure must be enforced
  // - Shutdown must stop all activity
  _pipeLoop(): Promise<void> {
    return newPromise<void>((resolveLoop, rejectLoop) => {
      this._resolveLoop = resolveLoop;
      this._rejectLoop = rejectLoop;
      this._next(false);
    });
  }

  _pipeStep(): Promise<boolean> {
    const source = this._source;
    const dest = this._dest;
    const reader = this._reader;

    // Fast path: read available chunks synchronously in a single batch
    while (
      !this._shuttingDown
      && !dest._backpressure
      && dest._state === 'writable'
      && !WritableStreamCloseQueuedOrInFlight(dest)
      && source._state === 'readable'
      && ReadableStreamDefaultReaderCanReadSync(reader)
    ) {
      ReadableStreamDefaultReaderRead(reader, this);
    }

    // Slow path: wait for chunk to become available
    if (this._shuttingDown) {
      return resolvedTruePromise;
    }
    if (dest._backpressure) {
      // Resume through pipeLoop instead of recursively adopting the next step's promise.
      // Otherwise, repeated backpressure retains a promise chain until the pipe finishes.
      return PerformPromiseThen(writerReadyPromise(this._writer), returnFalse);
    }
    const stepPromise = newPromise(this._stepExecutor);
    ReadableStreamDefaultReaderRead(reader, this);
    return stepPromise;
  }

  // The engine is the read request for every read of the pipe.
  // A synchronous read (in the fast path of a pipe step) always has a chunk available,
  // otherwise the pending read of the current pipe step is settled.
  _chunkSteps(chunk: T): void {
    this._write(chunk);
    const resolveStep = this._resolveStep;
    if (resolveStep !== undefined) {
      this._resolveStep = undefined;
      this._rejectStep = undefined;
      resolveStep(false);
    }
  }

  _closeSteps(): void {
    const resolveStep = this._resolveStep!;
    assert(resolveStep !== undefined);
    this._resolveStep = undefined;
    this._rejectStep = undefined;
    resolveStep(true);
  }

  _errorSteps(e: any): void {
    const rejectStep = this._rejectStep!;
    assert(rejectStep !== undefined);
    this._resolveStep = undefined;
    this._rejectStep = undefined;
    rejectStep(e);
  }

  // Instead of reacting to the closed promises of the reader and the writer (which would need to be materialized
  // and then rejected again on release), listen for state changes directly. The first change settles a single
  // promise that the pipe reacts to, so the shutdown steps still run in the same microtask as a reaction on
  // the closed promise would have, and in the async context of the pipeTo() call.
  _watchForStateChanges(): void {
    const source = this._source;
    const dest = this._dest;

    const stateChangePromise = newPromise<void>((resolveFn) => {
      this._resolveStateChange = resolveFn;
    });
    uponFulfillment(stateChangePromise, () => {
      this._runStateChangeSteps();
      return null;
    });

    if (source._state === 'readable') {
      readerSetStateChangeListener(this._reader, () => {
        if (source._state === 'errored') {
          this._onStateChange('source-errored', source._storedError);
        } else {
          assert(source._state === 'closed');
          this._onStateChange('source-closed', undefined);
        }
      });
    }
    if (dest._state === 'writable' || dest._state === 'erroring') {
      writerSetStateChangeListener(this._writer, () => {
        assert(dest._state === 'errored');
        this._onStateChange('dest-errored', dest._storedError);
      });
    }
  }

  _onStateChange(stateChange: StateChange, storedError: any): void {
    if (this._stateChange !== 'none') {
      // Already notified. The shutdown steps of the first change win, as with separate promise reactions.
      return;
    }
    this._stateChange = stateChange;
    this._stateChangeError = storedError;
    this._resolveStateChange!();
  }

  _runStateChangeSteps(): void {
    switch (this._stateChange) {
      case 'source-errored':
        this._sourceErrored(this._stateChangeError);
        break;
      case 'source-closed':
        this._sourceClosed();
        break;
      case 'dest-errored':
        this._destErrored(this._stateChangeError);
        break;
      default:
        unexpected();
    }
  }

  // Errors must be propagated forward
  _sourceErrored(storedError: any): void {
    if (!this._preventAbort) {
      this._shutdownWithAction(this._abortDest, true, storedError);
    } else {
      this._shutdown(true, storedError);
    }
  }

  // Errors must be propagated backward
  _destErrored(storedError: any): void {
    if (!this._preventCancel) {
      this._shutdownWithAction(this._cancelSource, true, storedError);
    } else {
      this._shutdown(true, storedError);
    }
  }

  // Closing must be propagated forward
  _sourceClosed(): void {
    if (!this._preventClose) {
      this._shutdownWithAction(this._closeDest, false, undefined);
    } else {
      this._shutdown(false, undefined);
    }
  }

  // Shutdown actions. The error (if any) is the shutdown error.
  _abortDest(): Promise<unknown> {
    return WritableStreamAbort(this._dest, this._shutdownError);
  }

  _cancelSource(): Promise<unknown> {
    return ReadableStreamCancel(this._source, this._shutdownError);
  }

  _closeDest(): Promise<unknown> {
    return WritableStreamDefaultWriterCloseWithErrorPropagation(this._writer);
  }

  _abortDestAndCancelSource(): Promise<unknown> {
    const source = this._source;
    const dest = this._dest;
    const error = this._shutdownError;
    const promises: Array<Promise<void>> = [];
    if (!this._preventAbort) {
      promises.push(dest._state === 'writable' ? WritableStreamAbort(dest, error) : promiseResolvedWith(undefined));
    }
    if (!this._preventCancel) {
      promises.push(source._state === 'readable' ? ReadableStreamCancel(source, error) : promiseResolvedWith(undefined));
    }
    return Promise.all(promises);
  }

  _shutdownWithAction(action: (this: PipeEngine<T>) => Promise<unknown>, originalIsError: boolean, originalError: any) {
    if (this._shuttingDown) {
      return;
    }
    this._shuttingDown = true;
    this._shutdownAction = action;
    this._shutdownIsError = originalIsError;
    this._shutdownError = originalError;

    const dest = this._dest;
    if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
      uponFulfillment(this._waitForWritesToFinish(), () => this._performShutdownAction());
    } else {
      this._performShutdownAction();
    }
  }

  _performShutdownAction(): null {
    uponPromise(
      this._shutdownAction!.call(this),
      () => this._finalize(this._shutdownIsError, this._shutdownError),
      newError => this._finalize(true, newError)
    );
    return null;
  }

  _shutdown(isError: boolean, error: any) {
    if (this._shuttingDown) {
      return;
    }
    this._shuttingDown = true;

    const dest = this._dest;
    if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
      uponFulfillment(this._waitForWritesToFinish(), () => this._finalize(isError, error));
    } else {
      this._finalize(isError, error);
    }
  }

  _finalize(isError: boolean, error: any): null {
    WritableStreamDefaultWriterRelease(this._writer);
    ReadableStreamReaderGenericRelease(this._reader);

    if (this._signal !== undefined) {
      this._signal.removeEventListener('abort', this._abortAlgorithm!);
    }
    if (isError) {
      this._reject(error);
    } else {
      this._resolve(undefined);
    }

    return null;
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

class PipeWriteRequest<T> implements WriteRequest {
  readonly _engine: PipeEngine<T>;
  readonly _writeNumber: number;

  constructor(engine: PipeEngine<T>, writeNumber: number) {
    this._engine = engine;
    this._writeNumber = writeNumber;
  }

  _resolve() {
    this._engine._writeSettled(this._writeNumber);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _reject(_reason: any) {
    this._engine._writeSettled(this._writeNumber);
  }
}
