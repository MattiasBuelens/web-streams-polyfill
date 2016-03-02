const assert$1 = require('assert');

function typeIsObject(x) {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
}

function createDataProperty(o, p, v) {
  assert$1(typeIsObject(o));
  Object.defineProperty(o, p, { value: v, writable: true, enumerable: true, configurable: true });
}

function createArrayFromList(elements) {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice();
}

function CreateIterResultObject(value, done) {
  assert$1(typeof done === 'boolean');
  const obj = {};
  Object.defineProperty(obj, 'value', { value: value, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(obj, 'done', { value: done, enumerable: true, writable: true, configurable: true });
  return obj;
}

function InvokeOrNoop(O, P, args) {
  const method = O[P];
  if (method === undefined) {
    return undefined;
  }
  return method.apply(O, args);
}

function PromiseInvokeOrNoop(O, P, args) {
  let method;
  try {
    method = O[P];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return Promise.resolve(undefined);
  }

  try {
    return Promise.resolve(method.apply(O, args));
  } catch (e) {
    return Promise.reject(e);
  }
}

function PromiseInvokeOrFallbackOrNoop(O, P1, args1, P2, args2) {
  let method;
  try {
    method = O[P1];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return PromiseInvokeOrNoop(O, P2, args2);
  }

  try {
    return Promise.resolve(method.apply(O, args1));
  } catch (e) {
    return Promise.reject(e);
  }
}

function ValidateAndNormalizeQueuingStrategy(size, highWaterMark) {
  if (size !== undefined && typeof size !== 'function') {
    throw new TypeError('size property of a queuing strategy must be a function');
  }

  highWaterMark = Number(highWaterMark);
  if (Number.isNaN(highWaterMark)) {
    throw new TypeError('highWaterMark property of a queuing strategy must be convertible to a non-NaN number');
  }
  if (highWaterMark < 0) {
    throw new RangeError('highWaterMark property of a queuing strategy must be nonnegative');
  }

  return { size, highWaterMark };
}

const assert$2 = require('assert');

function rethrowAssertionErrorRejection(e) {
  // Used throughout the reference implementation, as `.catch(rethrowAssertionErrorRejection)`, to ensure any errors
  // get shown. There are places in the spec where we do promise transformations and purposefully ignore or don't
  // expect any errors, but assertion errors are always problematic.
  if (e && e.constructor === assert$2.AssertionError) {
    setTimeout(() => {
      throw e;
    }, 0);
  }
}

const assert$3 = require('assert');

function DequeueValue(queue) {
  assert$3(queue.length > 0, 'Spec-level failure: should never dequeue from an empty queue.');
  const pair = queue.shift();
  return pair.value;
}

function EnqueueValueWithSize(queue, value, size) {
  size = Number(size);
  if (Number.isNaN(size) || size === +Infinity || size < 0) {
    throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
  }

  queue.push({ value: value, size: size });
}

function GetTotalQueueSize(queue) {
  let totalSize = 0;

  queue.forEach(pair => {
    assert$3(typeof pair.size === 'number' && !Number.isNaN(pair.size) &&
      pair.size !== +Infinity && pair.size !== -Infinity,
      'Spec-level failure: should never find an invalid size in the queue.');
    totalSize += pair.size;
  });

  return totalSize;
}

function PeekQueueValue(queue) {
  assert$3(queue.length > 0, 'Spec-level failure: should never peek at an empty queue.');
  const pair = queue[0];
  return pair.value;
}

const assert = require('assert');
class ReadableStream {
  constructor(underlyingSource = {}, { size, highWaterMark = 1 } = {}) {
    this._underlyingSource = underlyingSource;
    this._queue = [];
    this._state = 'readable';
    this._started = false;
    this._closeRequested = false;
    this._pulling = false;
    this._pullAgain = false;
    this._reader = undefined;
    this._storedError = undefined;

    this._disturbed = false;

    const normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    this._controller = new ReadableStreamController(this);

    const startResult = InvokeOrNoop(underlyingSource, 'start', [this._controller]);
    Promise.resolve(startResult).then(
      () => {
        this._started = true;
        RequestReadableStreamPull(this);
      },
      r => {
        if (this._state === 'readable') {
          return ErrorReadableStream(this, r);
        }
      }
    )
    .catch(rethrowAssertionErrorRejection);
  }

  get locked() {
    if (IsReadableStream(this) === false) {
      throw new TypeError('ReadableStream.prototype.locked can only be used on a ReadableStream');
    }

    return IsReadableStreamLocked(this);
  }

  cancel(reason) {
    if (IsReadableStream(this) === false) {
      return Promise.reject(new TypeError('ReadableStream.prototype.cancel can only be used on a ReadableStream'));
    }

    if (IsReadableStreamLocked(this) === true) {
      return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
    }

    return CancelReadableStream(this, reason);
  }

  getReader() {
    if (IsReadableStream(this) === false) {
      throw new TypeError('ReadableStream.prototype.getReader can only be used on a ReadableStream');
    }

    return AcquireReadableStreamReader(this);
  }

  pipeThrough({ writable, readable }, options) {
    this.pipeTo(writable, options);
    return readable;
  }

  pipeTo(dest, { preventClose, preventAbort, preventCancel } = {}) {
    preventClose = Boolean(preventClose);
    preventAbort = Boolean(preventAbort);
    preventCancel = Boolean(preventCancel);

    const source = this;

    let reader;
    let lastRead;
    let lastWrite;
    let closedPurposefully = false;
    let resolvePipeToPromise;
    let rejectPipeToPromise;

    return new Promise((resolve, reject) => {
      resolvePipeToPromise = resolve;
      rejectPipeToPromise = reject;

      reader = source.getReader();

      reader.closed.catch(abortDest);
      dest.closed.then(
        () => {
          if (!closedPurposefully) {
            cancelSource(new TypeError('destination is closing or closed and cannot be piped to anymore'));
          }
        },
        cancelSource
      );

      doPipe();
    });

    function doPipe() {
      lastRead = reader.read();
      Promise.all([lastRead, dest.ready]).then(([{ value, done }]) => {
        if (Boolean(done) === true) {
          closeDest();
        } else if (dest.state === 'writable') {
          lastWrite = dest.write(value);
          doPipe();
        }
      })
      .catch(rethrowAssertionErrorRejection);

      // Any failures will be handled by listening to reader.closed and dest.closed above.
      // TODO: handle malicious dest.write/dest.close?
    }

    function cancelSource(reason) {
      if (preventCancel === false) {
        reader.cancel(reason);
        reader.releaseLock();
        rejectPipeToPromise(reason);
      } else {
        // If we don't cancel, we need to wait for lastRead to finish before we're allowed to release.
        // We don't need to handle lastRead failing because that will trigger abortDest which takes care of
        // both of these.
        lastRead.then(() => {
          reader.releaseLock();
          rejectPipeToPromise(reason);
        });
      }
    }

    function closeDest() {
      // Does not need to wait for lastRead since it occurs only on source closed.

      reader.releaseLock();

      const destState = dest.state;
      if (preventClose === false && (destState === 'waiting' || destState === 'writable')) {
        closedPurposefully = true;
        dest.close().then(resolvePipeToPromise, rejectPipeToPromise);
      } else if (lastWrite !== undefined) {
        lastWrite.then(resolvePipeToPromise, rejectPipeToPromise);
      } else {
        resolvePipeToPromise();
      }
    }

    function abortDest(reason) {
      // Does not need to wait for lastRead since it only occurs on source errored.

      reader.releaseLock();

      if (preventAbort === false) {
        dest.abort(reason);
      }
      rejectPipeToPromise(reason);
    }
  }

  tee() {
    if (IsReadableStream(this) === false) {
      throw new TypeError('ReadableStream.prototype.tee can only be used on a ReadableStream');
    }

    const branches = TeeReadableStream(this, false);
    return createArrayFromList(branches);
  }
}

class ReadableStreamController {
  constructor(stream) {
    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamController can only be constructed with a ReadableStream instance');
    }

    if (stream._controller !== undefined) {
      throw new TypeError('ReadableStreamController instances can only be created by the ReadableStream constructor');
    }

    this._controlledReadableStream = stream;
  }

  get desiredSize() {
    if (IsReadableStreamController(this) === false) {
      throw new TypeError(
        'ReadableStreamController.prototype.desiredSize can only be used on a ReadableStreamController');
    }

    return GetReadableStreamDesiredSize(this._controlledReadableStream);
  }

  close() {
    if (IsReadableStreamController(this) === false) {
      throw new TypeError('ReadableStreamController.prototype.close can only be used on a ReadableStreamController');
    }

    const stream = this._controlledReadableStream;

    if (stream._closeRequested === true) {
      throw new TypeError('The stream has already been closed; do not close it again!');
    }
    if (stream._state === 'errored') {
      throw new TypeError('The stream is in an errored state and cannot be closed');
    }

    return CloseReadableStream(stream);
  }

  enqueue(chunk) {
    if (IsReadableStreamController(this) === false) {
      throw new TypeError('ReadableStreamController.prototype.enqueue can only be used on a ReadableStreamController');
    }

    const stream = this._controlledReadableStream;

    if (stream._state === 'errored') {
      throw stream._storedError;
    }

    if (stream._closeRequested === true) {
      throw new TypeError('stream is closed or draining');
    }

    return EnqueueInReadableStream(stream, chunk);
  }

  error(e) {
    if (IsReadableStreamController(this) === false) {
      throw new TypeError('ReadableStreamController.prototype.error can only be used on a ReadableStreamController');
    }

    if (this._controlledReadableStream._state !== 'readable') {
      throw new TypeError(`The stream is ${this._controlledReadableStream._state} and so cannot be errored`);
    }

    return ErrorReadableStream(this._controlledReadableStream, e);
  }
}

class ReadableStreamReader {
  constructor(stream) {
    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamReader can only be constructed with a ReadableStream instance');
    }
    if (IsReadableStreamLocked(stream) === true) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    this._ownerReadableStream = stream;
    stream._reader = this;

    this._readRequests = [];

    if (stream._state === 'readable') {
      this._closedPromise = new Promise((resolve, reject) => {
        this._closedPromise_resolve = resolve;
        this._closedPromise_reject = reject;
      });
    } else if (stream._state === 'closed') {
      this._closedPromise = Promise.resolve(undefined);
      this._closedPromise_resolve = undefined;
      this._closedPromise_reject = undefined;
    } else {
      assert(stream._state === 'errored');
      this._closedPromise = Promise.reject(stream._storedError);
      this._closedPromise_resolve = undefined;
      this._closedPromise_reject = undefined;
    }
  }

  get closed() {
    if (IsReadableStreamReader(this) === false) {
      return Promise.reject(
        new TypeError('ReadableStreamReader.prototype.closed can only be used on a ReadableStreamReader'));
    }

    return this._closedPromise;
  }

  cancel(reason) {
    if (IsReadableStreamReader(this) === false) {
      return Promise.reject(
        new TypeError('ReadableStreamReader.prototype.cancel can only be used on a ReadableStreamReader'));
    }

    if (this._ownerReadableStream === undefined) {
      return Promise.reject(new TypeError('Cannot cancel a stream using a released reader'));
    }

    return CancelReadableStream(this._ownerReadableStream, reason);
  }

  read() {
    if (IsReadableStreamReader(this) === false) {
      return Promise.reject(
        new TypeError('ReadableStreamReader.prototype.read can only be used on a ReadableStreamReader'));
    }

    if (this._ownerReadableStream === undefined) {
      return Promise.reject(new TypeError('Cannot read from a released reader'));
    }

    return ReadFromReadableStreamReader(this);
  }

  releaseLock() {
    if (IsReadableStreamReader(this) === false) {
      throw new TypeError('ReadableStreamReader.prototype.releaseLock can only be used on a ReadableStreamReader');
    }

    if (this._ownerReadableStream === undefined) {
      return undefined;
    }

    if (this._readRequests.length > 0) {
      throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
    }

    if (this._ownerReadableStream._state === 'readable') {
      this._closedPromise_reject(
        new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
    } else {
      this._closedPromise = Promise.reject(
        new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
    }

    this._ownerReadableStream._reader = undefined;
    this._ownerReadableStream = undefined;

    return undefined;
  }
}


function AcquireReadableStreamReader(stream) {
  return new ReadableStreamReader(stream);
}

function CancelReadableStream(stream, reason) {
  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(undefined);
  }
  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  stream._queue = [];
  FinishClosingReadableStream(stream);

  const sourceCancelPromise = PromiseInvokeOrNoop(stream._underlyingSource, 'cancel', [reason]);
  return sourceCancelPromise.then(() => undefined);
}

function CloseReadableStream(stream) {
  assert(stream._closeRequested === false);
  assert(stream._state !== 'errored');

  if (stream._state === 'closed') {
    // This will happen if the stream was closed without calling its controller's close() method, i.e. if it was closed
    // via cancellation.
    return undefined;
  }

  stream._closeRequested = true;

  if (stream._queue.length === 0) {
    return FinishClosingReadableStream(stream);
  }
}

function EnqueueInReadableStream(stream, chunk) {
  assert(stream._closeRequested === false);
  assert(stream._state !== 'errored');

  if (stream._state === 'closed') {
    // This will happen if the stream was closed without calling its controller's close() method, i.e. if it was closed
    // via cancellation.
    return undefined;
  }

  if (IsReadableStreamLocked(stream) === true && stream._reader._readRequests.length > 0) {
    const readRequest = stream._reader._readRequests.shift();
    readRequest._resolve(CreateIterResultObject(chunk, false));
  } else {
    let chunkSize = 1;

    if (stream._strategySize !== undefined) {
      try {
        chunkSize = stream._strategySize(chunk);
      } catch (chunkSizeE) {
        if (stream._state === 'readable') {
          ErrorReadableStream(stream, chunkSizeE);
        }
        throw chunkSizeE;
      }
    }

    try {
      EnqueueValueWithSize(stream._queue, chunk, chunkSize);
    } catch (enqueueE) {
      if (stream._state === 'readable') {
        ErrorReadableStream(stream, enqueueE);
      }
      throw enqueueE;
    }
  }

  RequestReadableStreamPull(stream);

  return undefined;
}

function ErrorReadableStream(stream, e) {
  assert(stream._state === 'readable');

  stream._queue = [];
  stream._storedError = e;
  stream._state = 'errored';

  const reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  for (const { _reject } of reader._readRequests) {
    _reject(e);
  }
  reader._readRequests = [];

  reader._closedPromise_reject(e);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;

  return undefined;
}

function FinishClosingReadableStream(stream) {
  assert(stream._state === 'readable');

  stream._state = 'closed';

  const reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  for (const { _resolve } of reader._readRequests) {
    _resolve(CreateIterResultObject(undefined, true));
  }
  reader._readRequests = [];

  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;

  return undefined;
}

function GetReadableStreamDesiredSize(stream) {
  const queueSize = GetTotalQueueSize(stream._queue);
  return stream._strategyHWM - queueSize;
}

function IsReadableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSource')) {
    return false;
  }

  return true;
}

function IsReadableStreamLocked(stream) {
  assert(IsReadableStream(stream) === true, 'IsReadableStreamLocked should only be used on known readable streams');

  if (stream._reader === undefined) {
    return false;
  }

  return true;
}

function IsReadableStreamController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableStream')) {
    return false;
  }

  return true;
}

function IsReadableStreamReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_ownerReadableStream')) {
    return false;
  }

  return true;
}

function ReadFromReadableStreamReader(reader) {
  assert(reader._ownerReadableStream !== undefined);

  reader._ownerReadableStream._disturbed = true;

  if (reader._ownerReadableStream._state === 'closed') {
    return Promise.resolve(CreateIterResultObject(undefined, true));
  }

  if (reader._ownerReadableStream._state === 'errored') {
    return Promise.reject(reader._ownerReadableStream._storedError);
  }

  assert(reader._ownerReadableStream._state === 'readable');

  if (reader._ownerReadableStream._queue.length > 0) {
    const chunk = DequeueValue(reader._ownerReadableStream._queue);

    if (reader._ownerReadableStream._closeRequested === true && reader._ownerReadableStream._queue.length === 0) {
      FinishClosingReadableStream(reader._ownerReadableStream);
    } else {
      RequestReadableStreamPull(reader._ownerReadableStream);
    }

    return Promise.resolve(CreateIterResultObject(chunk, false));
  } else {
    const readRequest = {};
    readRequest.promise = new Promise((resolve, reject) => {
      readRequest._resolve = resolve;
      readRequest._reject = reject;
    });

    reader._readRequests.push(readRequest);
    RequestReadableStreamPull(reader._ownerReadableStream);
    return readRequest.promise;
  }
}

function RequestReadableStreamPull(stream) {
  const shouldPull = ShouldReadableStreamPull(stream);
  if (shouldPull === false) {
    return undefined;
  }

  if (stream._pulling === true) {
    stream._pullAgain = true;
    return undefined;
  }

  stream._pulling = true;
  const pullPromise = PromiseInvokeOrNoop(stream._underlyingSource, 'pull', [stream._controller]);
  pullPromise.then(
    () => {
      stream._pulling = false;

      if (stream._pullAgain === true) {
        stream._pullAgain = false;
        return RequestReadableStreamPull(stream);
      }
    },
    e => {
      if (stream._state === 'readable') {
        return ErrorReadableStream(stream, e);
      }
    }
  )
  .catch(rethrowAssertionErrorRejection);

  return undefined;
}

function ShouldReadableStreamPull(stream) {
  if (stream._state === 'closed' || stream._state === 'errored') {
    return false;
  }

  if (stream._closeRequested === true) {
    return false;
  }

  if (stream._started === false) {
    return false;
  }

  if (IsReadableStreamLocked(stream) === true && stream._reader._readRequests.length > 0) {
    return true;
  }

  const desiredSize = GetReadableStreamDesiredSize(stream);
  if (desiredSize > 0) {
    return true;
  }

  return false;
}

function TeeReadableStream(stream, shouldClone) {
  assert(IsReadableStream(stream) === true);
  assert(typeof shouldClone === 'boolean');

  const reader = AcquireReadableStreamReader(stream);

  const teeState = {
    closedOrErrored: false,
    canceled1: false,
    canceled2: false,
    reason1: undefined,
    reason2: undefined
  };
  teeState.promise = new Promise(resolve => teeState._resolve = resolve);

  const pull = create_TeeReadableStreamPullFunction();
  pull._reader = reader;
  pull._teeState = teeState;
  pull._shouldClone = shouldClone;

  const cancel1 = create_TeeReadableStreamBranch1CancelFunction();
  cancel1._stream = stream;
  cancel1._teeState = teeState;

  const cancel2 = create_TeeReadableStreamBranch2CancelFunction();
  cancel2._stream = stream;
  cancel2._teeState = teeState;

  const underlyingSource1 = Object.create(Object.prototype);
  createDataProperty(underlyingSource1, 'pull', pull);
  createDataProperty(underlyingSource1, 'cancel', cancel1);
  const branch1 = new ReadableStream(underlyingSource1);

  const underlyingSource2 = Object.create(Object.prototype);
  createDataProperty(underlyingSource2, 'pull', pull);
  createDataProperty(underlyingSource2, 'cancel', cancel2);
  const branch2 = new ReadableStream(underlyingSource2);

  pull._branch1 = branch1;
  pull._branch2 = branch2;

  reader._closedPromise.catch(r => {
    if (teeState.closedOrErrored === true) {
      return undefined;
    }

    ErrorReadableStream(branch1, r);
    ErrorReadableStream(branch2, r);
    teeState.closedOrErrored = true;
  });

  return [branch1, branch2];
}

function create_TeeReadableStreamPullFunction() {
  const f = () => {
    const { _reader: reader, _branch1: branch1, _branch2: branch2, _teeState: teeState, _shouldClone: shouldClone } = f;

    return ReadFromReadableStreamReader(reader).then(result => {
      assert(typeIsObject(result));
      const value = result.value;
      const done = result.done;
      assert(typeof done === "boolean");

      if (done === true && teeState.closedOrErrored === false) {
        CloseReadableStream(branch1);
        CloseReadableStream(branch2);
        teeState.closedOrErrored = true;
      }

      if (teeState.closedOrErrored === true) {
        return undefined;
      }

      // There is no way to access the cloning code right now in the reference implementation.
      // If we add one then we'll need an implementation for StructuredClone.


      if (teeState.canceled1 === false) {
        let value1 = value;
//        if (shouldClone === true) {
//          value1 = StructuredClone(value);
//        }
        EnqueueInReadableStream(branch1, value1);
      }

      if (teeState.canceled2 === false) {
        let value2 = value;
//        if (shouldClone === true) {
//          value2 = StructuredClone(value);
//        }
        EnqueueInReadableStream(branch2, value2);
      }
    });
  };
  return f;
}

function create_TeeReadableStreamBranch1CancelFunction() {
  const f = reason => {
    const { _stream: stream, _teeState: teeState } = f;

    teeState.canceled1 = true;
    teeState.reason1 = reason;
    if (teeState.canceled2 === true) {
      const compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      const cancelResult = CancelReadableStream(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

function create_TeeReadableStreamBranch2CancelFunction() {
  const f = reason => {
    const { _stream: stream, _teeState: teeState } = f;

    teeState.canceled2 = true;
    teeState.reason2 = reason;
    if (teeState.canceled1 === true) {
      const compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      const cancelResult = CancelReadableStream(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

class CountQueuingStrategy {
  constructor({ highWaterMark }) {
    createDataProperty(this, 'highWaterMark', highWaterMark);
  }

  size(chunk) {
    return 1;
  }
}

const assert$4 = require('assert');
class WritableStream {
  constructor(underlyingSink = {}, { size, highWaterMark = 0 } = {}) {
    this._underlyingSink = underlyingSink;

    this._closedPromise = new Promise((resolve, reject) => {
      this._closedPromise_resolve = resolve;
      this._closedPromise_reject = reject;
    });

    this._readyPromise = Promise.resolve(undefined);
    this._readyPromise_resolve = null;

    this._queue = [];
    this._state = 'writable';
    this._started = false;
    this._writing = false;

    const normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    SyncWritableStreamStateWithQueue(this);

    const error = closure_WritableStreamErrorFunction();
    error._stream = this;

    const startResult = InvokeOrNoop(underlyingSink, 'start', [error]);
    this._startedPromise = Promise.resolve(startResult);
    this._startedPromise.then(() => {
      this._started = true;
      this._startedPromise = undefined;
    });
    this._startedPromise.catch(r => ErrorWritableStream(this, r)).catch(rethrowAssertionErrorRejection);
  }

  get closed() {
    if (!IsWritableStream(this)) {
      return Promise.reject(new TypeError('WritableStream.prototype.closed can only be used on a WritableStream'));
    }

    return this._closedPromise;
  }

  get state() {
    if (!IsWritableStream(this)) {
      throw new TypeError('WritableStream.prototype.state can only be used on a WritableStream');
    }

    return this._state;
  }

  abort(reason) {
    if (!IsWritableStream(this)) {
      return Promise.reject(new TypeError('WritableStream.prototype.abort can only be used on a WritableStream'));
    }

    if (this._state === 'closed') {
      return Promise.resolve(undefined);
    }
    if (this._state === 'errored') {
      return Promise.reject(this._storedError);
    }

    ErrorWritableStream(this, reason);
    const sinkAbortPromise = PromiseInvokeOrFallbackOrNoop(this._underlyingSink, 'abort', [reason], 'close', []);
    return sinkAbortPromise.then(() => undefined);
  }

  close() {
    if (!IsWritableStream(this)) {
      return Promise.reject(new TypeError('WritableStream.prototype.close can only be used on a WritableStream'));
    }

    if (this._state === 'closing') {
      return Promise.reject(new TypeError('cannot close an already-closing stream'));
    }
    if (this._state === 'closed') {
      return Promise.reject(new TypeError('cannot close an already-closed stream'));
    }
    if (this._state === 'errored') {
      return Promise.reject(this._storedError);
    }
    if (this._state === 'waiting') {
      this._readyPromise_resolve(undefined);
    }

    this._state = 'closing';
    EnqueueValueWithSize(this._queue, 'close', 0);
    CallOrScheduleWritableStreamAdvanceQueue(this);

    return this._closedPromise;
  }

  get ready() {
    if (!IsWritableStream(this)) {
      return Promise.reject(new TypeError('WritableStream.prototype.ready can only be used on a WritableStream'));
    }

    return this._readyPromise;
  }

  write(chunk) {
    if (!IsWritableStream(this)) {
      return Promise.reject(new TypeError('WritableStream.prototype.write can only be used on a WritableStream'));
    }

    if (this._state === 'closing') {
      return Promise.reject(new TypeError('cannot write while stream is closing'));
    }
    if (this._state === 'closed') {
      return Promise.reject(new TypeError('cannot write after stream is closed'));
    }
    if (this._state === 'errored') {
      return Promise.reject(this._storedError);
    }

    assert$4(this._state === 'waiting' || this._state === 'writable');

    let chunkSize = 1;

    if (this._strategySize !== undefined) {
      try {
        chunkSize = this._strategySize(chunk);
      } catch (chunkSizeE) {
        ErrorWritableStream(this, chunkSizeE);
        return Promise.reject(chunkSizeE);
      }
    }

    let resolver, rejecter;
    const promise = new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });

    const writeRecord = { promise: promise, chunk: chunk, _resolve: resolver, _reject: rejecter };
    try {
      EnqueueValueWithSize(this._queue, writeRecord, chunkSize);
    } catch (enqueueResultE) {
      ErrorWritableStream(this, enqueueResultE);
      return Promise.reject(enqueueResultE);
    }

    SyncWritableStreamStateWithQueue(this);
    CallOrScheduleWritableStreamAdvanceQueue(this);
    return promise;
  }
}

function closure_WritableStreamErrorFunction() {
  const f = e => ErrorWritableStream(f._stream, e);
  return f;
}


function CallOrScheduleWritableStreamAdvanceQueue(stream) {
  if (stream._started === false) {
    stream._startedPromise.then(() => {
      WritableStreamAdvanceQueue(stream);
    })
    .catch(rethrowAssertionErrorRejection);
    return undefined;
  }

  if (stream._started === true) {
    return WritableStreamAdvanceQueue(stream);
  }
}

function CloseWritableStream(stream) {
  assert$4(stream._state === 'closing', 'stream must be in closing state while calling CloseWritableStream');

  const sinkClosePromise = PromiseInvokeOrNoop(stream._underlyingSink, 'close');
  sinkClosePromise.then(
    () => {
      if (stream._state === 'errored') {
        return;
      }

      assert$4(stream._state === 'closing');

      stream._closedPromise_resolve(undefined);
      stream._closedPromise_resolve = undefined;
      stream._closedPromise_reject = undefined;
      stream._state = 'closed';
    },
    r => ErrorWritableStream(stream, r)
  )
  .catch(rethrowAssertionErrorRejection);
}

function ErrorWritableStream(stream, e) {
  if (stream._state === 'closed' || stream._state === 'errored') {
    return undefined;
  }

  while (stream._queue.length > 0) {
    const writeRecord = DequeueValue(stream._queue);
    if (writeRecord !== 'close') {
      writeRecord._reject(e);
    }
  }

  stream._storedError = e;

  if (stream._state === 'waiting') {
    stream._readyPromise_resolve(undefined);
  }
  stream._closedPromise_reject(e);
  stream._closedPromise_resolve = undefined;
  stream._closedPromise_reject = undefined;
  stream._state = 'errored';
}

function IsWritableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSink')) {
    return false;
  }

  return true;
}

function SyncWritableStreamStateWithQueue(stream) {
  if (stream._state === 'closing') {
    return undefined;
  }

  assert$4(stream._state === 'writable' || stream._state === 'waiting',
    'stream must be in a writable or waiting state while calling SyncWritableStreamStateWithQueue');

  const queueSize = GetTotalQueueSize(stream._queue);
  const shouldApplyBackpressure = queueSize > stream._strategyHWM;

  if (shouldApplyBackpressure === true && stream._state === 'writable') {
    stream._state = 'waiting';
    stream._readyPromise = new Promise((resolve, reject) => {
      stream._readyPromise_resolve = resolve;
    });
  }

  if (shouldApplyBackpressure === false && stream._state === 'waiting') {
    stream._state = 'writable';
    stream._readyPromise_resolve(undefined);
  }

  return undefined;
}

function WritableStreamAdvanceQueue(stream) {
  if (stream._queue.length === 0 || stream._writing === true) {
    return undefined;
  }

  const writeRecord = PeekQueueValue(stream._queue);

  if (writeRecord === 'close') {
    assert$4(stream._state === 'closing', 'can\'t process final write record unless already closing');
    DequeueValue(stream._queue);
    assert$4(stream._queue.length === 0, 'queue must be empty once the final write record is dequeued');
    return CloseWritableStream(stream);
  } else {
    stream._writing = true;

    PromiseInvokeOrNoop(stream._underlyingSink, 'write', [writeRecord.chunk]).then(
      () => {
        if (stream._state === 'errored') {
          return;
        }

        stream._writing = false;

        writeRecord._resolve(undefined);

        DequeueValue(stream._queue);
        SyncWritableStreamStateWithQueue(stream);
        WritableStreamAdvanceQueue(stream);
      },
      r => ErrorWritableStream(stream, r)
    )
    .catch(rethrowAssertionErrorRejection);
  }
}

class ByteLengthQueuingStrategy {
  constructor({ highWaterMark }) {
    createDataProperty(this, 'highWaterMark', highWaterMark);
  }

  size(chunk) {
    return chunk.byteLength;
  }
}

class TransformStream {
  constructor(transformer) {
    if (transformer.flush === undefined) {
      transformer.flush = (enqueue, close) => close();
    }

    if (typeof transformer.transform !== 'function') {
      throw new TypeError('transform must be a function');
    }

    let writeChunk, writeDone, errorWritable;
    let transforming = false;
    let chunkWrittenButNotYetTransformed = false;
    this.writable = new WritableStream({
      start(error) {
        errorWritable = error;
      },
      write(chunk) {
        writeChunk = chunk;
        chunkWrittenButNotYetTransformed = true;

        const p = new Promise(resolve => writeDone = resolve);
        maybeDoTransform();
        return p;
      },
      close() {
        try {
          transformer.flush(enqueueInReadable, closeReadable);
        } catch (e) {
          errorWritable(e);
          errorReadable(e);
        }
      }
    }, transformer.writableStrategy);

    let enqueueInReadable, closeReadable, errorReadable;
    this.readable = new ReadableStream({
      start(c) {
        enqueueInReadable = c.enqueue.bind(c);
        closeReadable = c.close.bind(c);
        errorReadable = c.error.bind(c);
      },
      pull() {
        if (chunkWrittenButNotYetTransformed === true) {
          maybeDoTransform();
        }
      }
    }, transformer.readableStrategy);

    function maybeDoTransform() {
      if (transforming === false) {
        transforming = true;
        try {
          transformer.transform(writeChunk, enqueueInReadable, transformDone);
          writeChunk = undefined;
          chunkWrittenButNotYetTransformed = false;
        } catch (e) {
          transforming = false;
          errorWritable(e);
          errorReadable(e);
        }
      }
    }

    function transformDone() {
      transforming = false;
      writeDone();
    }
  }
}

const assert$5 = require('assert');
class ReadableByteStream {
  constructor(underlyingByteSource = {}) {
    this._state = 'readable';
    this._reader = undefined;
    this._storedError = undefined;

    // Initialize to undefined first because the constructor of the ReadableByteStreamController checks this
    // variable to validate the caller.
    this._controller = undefined;
    this._controller = new ReadableByteStreamController(this, underlyingByteSource);
  }

  cancel(reason) {
    if (IsReadableByteStream(this) === false) {
      return Promise.reject(
          new TypeError('ReadableByteStream.prototype.cancel can only be used on a ReadableByteStream'));
    }

    if (IsReadableByteStreamLocked(this) === true) {
      return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
    }

    return CancelReadableByteStream(this, reason);
  }

  getByobReader() {
    if (IsReadableByteStream(this) === false) {
      throw new TypeError('ReadableByteStream.prototype.getByobReader can only be used on a ReadableByteStream');
    }

    return new ReadableByteStreamByobReader(this);
  }

  getReader() {
    if (IsReadableByteStream(this) === false) {
      throw new TypeError('ReadableByteStream.prototype.getReader can only be used on a ReadableByteStream');
    }

    return new ReadableByteStreamReader(this);
  }
}

class ReadableByteStreamController {
  constructor(controlledReadableByteStream, underlyingByteSource) {
    if (IsReadableByteStream(controlledReadableByteStream) === false) {
      throw new TypeError('ReadableByteStreamController can only be constructed with a ReadableByteStream instance');
    }

    if (controlledReadableByteStream._controller !== undefined) {
      throw new TypeError(
          'ReadableByteStreamController instances can only be created by the ReadableByteStream constructor');
    }

    this._controlledReadableByteStream = controlledReadableByteStream;

    this._underlyingByteSource = underlyingByteSource;

    this._pullAgain = false;
    this._pulling = false;

    this._pendingPullIntos = [];

    this._queue = [];
    this._totalQueuedBytes = 0;

    this._closeRequested = false;

    InvokeOrNoop(underlyingByteSource, 'start', [this]);
  }

  close() {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError(
          'ReadableByteStreamController.prototype.close can only be used on a ReadableByteStreamController');
    }

    const stream = this._controlledReadableByteStream;

    if (this._closeRequested) {
      throw new TypeError('The stream has already been closed; do not close it again!');
    }
    if (stream._state !== 'readable') {
      throw new TypeError('The stream is not in the readable state and cannot be closed');
    }

    if (this._totalQueuedBytes > 0) {
      this._closeRequested = true;

      return;
    }

    const reader = stream._reader;

    if (IsReadableByteStreamByobReader(reader) &&
        this._pendingPullIntos.length > 0) {
      const pullInto = this._pendingPullIntos[0];
      if (pullInto.bytesFilled > 0) {
        DestroyReadableByteStreamController(this);
        const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
        ErrorReadableByteStream(stream, e);

        throw e;
      }
    }

    CloseReadableByteStream(stream);
  }

  enqueue(chunk) {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError(
          'ReadableByteStreamController.prototype.enqueue can only be used on a ReadableByteStreamController');
    }

    const stream = this._controlledReadableByteStream;

    if (this._closeRequested) {
      throw new TypeError('stream is closed or draining');
    }
    if (stream._state !== 'readable') {
      throw new TypeError('The stream is not in the readable state and cannot be enqueued to');
    }

    const reader = stream._reader;

    const buffer = chunk.buffer;
    const byteOffset = chunk.byteOffset;
    const byteLength = chunk.byteLength;

    if (reader === undefined) {
      EnqueueInReadableByteStreamController(this, TransferArrayBuffer(buffer), byteOffset, byteLength);
    } else {
      if (IsReadableByteStreamReader(reader)) {
        if (reader._readRequests.length === 0) {
          EnqueueInReadableByteStreamController(this, TransferArrayBuffer(buffer), byteOffset, byteLength);
        } else {
          assert$5(this._queue.length === 0);

          const transferredView = new Uint8Array(TransferArrayBuffer(buffer), byteOffset, byteLength);
          RespondToReadRequest(reader, transferredView);

          if (reader._readRequests.length > 0) {
            ReadableByteStreamControllerCallPullOrPullIntoLaterIfNeeded(this);
          }
        }
      } else {
        assert$5(IsReadableByteStreamByobReader(reader), 'reader must be ReadableByteStreamByobReader');

        // TODO: Ideally this detaching should happen only if the buffer is not consumed fully.
        EnqueueInReadableByteStreamController(this, TransferArrayBuffer(buffer), byteOffset, byteLength);
        RespondToReadIntoRequestsFromQueue(this, reader);
      }
    }
  }

  error(e) {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError(
          'ReadableByteStreamController.prototype.error can only be used on a ReadableByteStreamController');
    }

    const stream = this._controlledReadableByteStream;

    if (stream._state !== 'readable') {
      throw new TypeError(`The stream is ${stream._state} and so cannot be errored`);
    }

    DestroyReadableByteStreamController(this);
    ErrorReadableByteStream(stream, e);
  }

  respond(bytesWritten, buffer) {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError(
          'ReadableByteStreamController.prototype.respond can only be used on a ReadableByteStreamController');
    }

    const stream = this._controlledReadableByteStream;

    if (this._pendingPullIntos.length === 0) {
      throw new TypeError('No pending BYOB read');
    }

    assert$5(IsReadableByteStreamLocked(stream), 'stream must be locked');

    const reader = stream._reader;

    assert$5(IsReadableByteStreamByobReader(reader), 'reader must be ReadableByteStreamByobReader');

    if (stream._state === 'closed') {
      if (bytesWritten !== 0) {
        throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
      }

      RespondToByobReaderInClosedState(this, reader, buffer);
    } else {
      assert$5(stream._state === 'readable');

      RespondToByobReaderInReadableState(this, reader, bytesWritten, buffer);
    }
  }
}

class ReadableByteStreamReader {
  constructor(stream) {
    if (!IsReadableByteStream(stream)) {
      throw new TypeError('ReadableByteStreamReader can only be constructed with a ReadableByteStream instance');
    }
    if (IsReadableByteStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    InitializeReadableByteStreamReaderGeneric(this, stream);

    this._readRequests = [];
  }

  get closed() {
    if (!IsReadableByteStreamReader(this)) {
      return Promise.reject(
        new TypeError('ReadableByteStreamReader.prototype.closed can only be used on a ReadableByteStreamReader'));
    }

    return this._closedPromise;
  }

  cancel(reason) {
    if (!IsReadableByteStreamReader(this)) {
      return Promise.reject(
        new TypeError('ReadableByteStreamReader.prototype.cancel can only be used on a ReadableByteStreamReader'));
    }

    if (this._state === 'closed') {
      return Promise.resolve(undefined);
    }

    if (this._state === 'errored') {
      return Promise.reject(this._storedError);
    }

    assert$5(this._ownerReadableByteStream !== undefined, 'This reader must be attached to a stream');

    return CancelReadableByteStream(this._ownerReadableByteStream, reason);
  }

  read() {
    if (!IsReadableByteStreamReader(this)) {
      return Promise.reject(
        new TypeError('ReadableByteStreamReader.prototype.read can only be used on a ReadableByteStreamReader'));
    }

    if (this._state === 'closed') {
      return Promise.resolve(CreateIterResultObject(undefined, true));
    }

    if (this._state === 'errored') {
      return Promise.reject(this._storedError);
    }

    assert$5(this._ownerReadableByteStream !== undefined, 'This reader must be attached to a stream');
    assert$5(this._ownerReadableByteStream._state === 'readable', 'The owner stream must be in readable state');

    const promise = new Promise((resolve, reject) => {
      this._readRequests.push({resolve, reject});
    });

    PullFromReadableByteStream(this._ownerReadableByteStream);

    return promise;
  }

  releaseLock() {
    if (!IsReadableByteStreamReader(this)) {
      throw new TypeError(
          'ReadableByteStreamReader.prototype.releaseLock can only be used on a ReadableByteStreamReader');
    }

    if (this._ownerReadableByteStream === undefined) {
      return;
    }

    if (this._readRequests.length > 0) {
      throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
    }

    assert$5(this._ownerReadableByteStream._state === 'readable');

    ReleaseReadableByteStreamReaderGeneric(this);
    CloseReadableByteStreamReaderGeneric(this);
  }
}

class ReadableByteStreamByobReader {
  constructor(stream) {
    if (!IsReadableByteStream(stream)) {
      throw new TypeError('ReadableByteStreamByobReader can only be constructed with a ReadableByteStream instance');
    }
    if (IsReadableByteStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    InitializeReadableByteStreamReaderGeneric(this, stream);

    this._readIntoRequests = [];
  }

  get closed() {
    if (!IsReadableByteStreamByobReader(this)) {
      return Promise.reject(
        new TypeError(
            'ReadableByteStreamByobReader.prototype.closed can only be used on a ReadableByteStreamByobReader'));
    }

    return this._closedPromise;
  }

  cancel(reason) {
    if (!IsReadableByteStreamByobReader(this)) {
      return Promise.reject(
        new TypeError(
            'ReadableByteStreamByobReader.prototype.cancel can only be used on a ReadableByteStreamByobReader'));
    }

    if (this._state === 'closed') {
      return Promise.resolve(undefined);
    }

    if (this._state === 'errored') {
      return Promise.reject(this._storedError);
    }

    assert$5(this._ownerReadableByteStream !== undefined, 'This stream must be attached to a stream');

    return CancelReadableByteStream(this._ownerReadableByteStream, reason);
  }

  read(view) {
    if (!IsReadableByteStreamByobReader(this)) {
      return Promise.reject(
        new TypeError(
            'ReadableByteStreamByobReader.prototype.read can only be used on a ReadableByteStreamByobReader'));
    }

    if (view === undefined || !ArrayBuffer.isView(view)) {
      return Promise.reject(new TypeError('Valid view must be provided'));
    }

    const ctor = view.constructor;
    let elementSize = 1;
    if (ctor === Int16Array || ctor === Uint16Array || ctor === Int32Array || ctor === Uint32Array ||
        ctor === Float32Array || ctor === Float64Array || ctor === Int8Array || ctor === Uint8Array ||
        ctor === Uint8ClampedArray) {
      elementSize = ctor.BYTES_PER_ELEMENT;
    } else if (ctor !== DataView) {
      return Promise.reject(new TypeError('view is of an unsupported type'));
    }

    if (view.byteLength === 0) {
      return Promise.reject(new TypeError('view must have non-zero byteLength'));
    }

    if (this._state === 'errored') {
      assert$5(this._ownerReadableByteStream === undefined, 'This reader must be detached');

      return Promise.reject(this._storedError);
    }

    if (this._state === 'closed' && this._ownerReadableByteStream === undefined) {
      return Promise.resolve(CreateIterResultObject(new ctor(view.buffer, view.byteOffset, 0), true));
    }

    const promise = new Promise((resolve, reject) => {
      const req = {
        resolve,
        reject,
        byteOffset: view.byteOffset,
        byteLength: view.byteLength,
        ctor,
        elementSize
      };
      this._readIntoRequests.push(req);
    });

    PullFromReadableByteStreamInto(
        this._ownerReadableByteStream, view.buffer, view.byteOffset, view.byteLength, elementSize);

    return promise;
  }

  releaseLock() {
    if (!IsReadableByteStreamByobReader(this)) {
      throw new TypeError(
          'ReadableByteStreamByobReader.prototype.releaseLock can only be used on a ReadableByteStreamByobReader');
    }

    if (this._ownerReadableByteStream === undefined) {
      return;
    }

    if (this._readIntoRequests.length > 0) {
      throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
    }

    assert$5(this._ownerReadableByteStream._state === 'readable');

    ReleaseReadableByteStreamReaderGeneric(this);
    CloseReadableByteStreamReaderGeneric(this);
  }
}

function ReadableByteStreamControllerCallPull(controller) {
  const stream = controller._controlledReadableByteStream;

  controller._pullAgain = false;
  controller._pulling = true;

  try {
    InvokeOrNoop(controller._underlyingByteSource, 'pull', []);
  } catch (e) {
    DestroyReadableByteStreamController(controller);
    if (stream._state === 'readable') {
      ErrorReadableByteStream(stream, e);
    }
  }

  controller._pulling = false;
}

function ReadableByteStreamControllerCallPullInto(controller) {
  const stream = controller._controlledReadableByteStream;

  assert$5(controller._pendingPullIntos.length > 0);
  const pullIntoDescriptor = controller._pendingPullIntos[0];

  controller._pullAgain = false;
  controller._pulling = true;

  try {
    InvokeOrNoop(controller._underlyingByteSource,
                 'pullInto',
                 [new Uint8Array(pullIntoDescriptor.buffer,
                                 pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled,
                                 pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled)]);
  } catch (e) {
    DestroyReadableByteStreamController(controller);
    const stream = controller._controlledReadableByteStream;
    if (stream._state === 'readable') {
      ErrorReadableByteStream(stream, e);
    }
  }

  controller._pulling = false;
}

function ReadableByteStreamControllerCallPullOrPullIntoLaterIfNeeded(controller) {
  controller._pullAgain = true;

  if (controller._pulling) {
    return;
  }

  process.nextTick(ReadableByteStreamControllerCallPullOrPullIntoRepeatedlyIfNeeded.bind(undefined, controller));
}

function ReadableByteStreamControllerCallPullOrPullIntoRepeatedlyIfNeeded(controller) {
  const stream = controller._controlledReadableByteStream;

  while (true) {
    if (!controller._pullAgain) {
      return;
    }

    if (controller._closeRequested) {
      return;
    }
    if (stream._state !== 'readable') {
      return;
    }

    const reader = stream._reader;

    if (reader === undefined) {
      return;
    }

    if (IsReadableByteStreamReader(reader)) {
      if (reader._readRequests.length === 0) {
        return;
      }

      ReadableByteStreamControllerCallPull(controller);
    } else {
      assert$5(IsReadableByteStreamByobReader(reader), 'reader must be ReadableByteStreamByobReader');

      if (reader._readIntoRequests.length === 0) {
        return;
      }

      ReadableByteStreamControllerCallPullInto(controller);
    }
  }
}

function CancelReadableByteStream(stream, reason) {
  if (stream._state === 'closed') {
    return Promise.resolve(undefined);
  }
  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  CloseReadableByteStream(stream);

  const sourceCancelPromise = CancelReadableByteStreamController(stream._controller, reason);
  return sourceCancelPromise.then(() => undefined);
}

function CancelReadableByteStreamController(controller, reason) {
  if (controller._pendingPullIntos.length > 0) {
    controller._pendingPullIntos[0].bytesFilled = 0;
  }

  controller._queue = [];
  controller._totalQueuedBytes = 0;

  return PromiseInvokeOrNoop(controller._underlyingByteSource, 'cancel', [reason]);
}

function CloseReadableByteStream(stream) {
  assert$5(IsReadableByteStream(stream), 'stream must be ReadableByteStream');
  assert$5(stream._state === 'readable', 'state must be readable');

  stream._state = 'closed';

  const reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableByteStreamReader(reader)) {
    for (const req of reader._readRequests) {
      req.resolve(CreateIterResultObject(undefined, true));
    }

    reader._readRequests = [];
    ReleaseReadableByteStreamReaderGeneric(reader);
  } else {
    assert$5(IsReadableByteStreamByobReader(reader), 'reader must be ReadableByteStreamByobReader');

    if (reader._readIntoRequests.length === 0) {
      ReleaseReadableByteStreamReaderGeneric(reader);
    }
  }

  CloseReadableByteStreamReaderGeneric(reader);
}

function CloseReadableByteStreamReaderGeneric(reader) {
  reader._state = 'closed';

  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function DestroyReadableByteStreamController(controller) {
  controller._pendingPullIntos = []
  controller._queue = [];
}

function TransferArrayBuffer(buffer) {
  // No-op. Just for marking places where detaching an ArrayBuffer is required.

  return buffer;
}

function ReleaseReadableByteStreamReaderGeneric(reader) {
  assert$5(reader._ownerReadableByteStream._reader !== undefined);
  assert$5(reader._ownerReadableByteStream !== undefined);

  reader._ownerReadableByteStream._reader = undefined;
  reader._ownerReadableByteStream = undefined;
}

function EnqueueInReadableByteStreamController(controller, buffer, byteOffset, byteLength) {
  controller._queue.push({buffer, byteOffset, byteLength});
  controller._totalQueuedBytes += byteLength;
}

function ErrorReadableByteStream(stream, e) {
  assert$5(IsReadableByteStream(stream), 'stream must be ReadableByteStream');
  assert$5(stream._state === 'readable', 'state must be readable');

  stream._state = 'errored';
  stream._storedError = e;

  const reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableByteStreamReader(reader)) {
    for (const req of reader._readRequests) {
      req.reject(e);
    }

    reader._readRequests = [];
  } else {
    assert$5(IsReadableByteStreamByobReader(reader), 'reader must be ReadableByteStreamByobReader');

    for (const req of reader._readIntoRequests) {
      req.reject(e);
    }

    reader._readIntoRequests = [];
  }

  ReleaseReadableByteStreamReaderGeneric(reader);

  reader._state = 'errored';
  reader._storedError = e;

  reader._closedPromise_reject(e);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function FillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) {
  const elementSize = pullIntoDescriptor.elementSize;

  const currentAlignedBytes = pullIntoDescriptor.bytesFilled - pullIntoDescriptor.bytesFilled % elementSize;

  const maxBytesToCopy = Math.min(controller._totalQueuedBytes,
                                  pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
  const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
  const maxAlignedBytes = maxBytesFilled - maxBytesFilled % elementSize;

  let totalBytesToCopyRemaining = maxBytesToCopy;
  let ready = false;
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }

  const queue = controller._queue;

  while (totalBytesToCopyRemaining > 0) {
    const headOfQueue = queue[0];

    const bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);

    const destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    new Uint8Array(pullIntoDescriptor.buffer).set(
        new Uint8Array(headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy), destStart);

    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller._totalQueuedBytes -= bytesToCopy;

    pullIntoDescriptor.bytesFilled += bytesToCopy;

    totalBytesToCopyRemaining -= bytesToCopy
  }

  if (!ready) {
    assert$5(controller._totalQueuedBytes === 0, 'queue must be empty');
    assert$5(pullIntoDescriptor.bytesFilled > 0);
    assert$5(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize);
  }

  return ready;
}

function InitializeReadableByteStreamReaderGeneric(reader, stream) {
  reader._state = stream._state;

  if (stream._state === 'readable') {
    stream._reader = reader;

    reader._ownerReadableByteStream = stream;
    reader._storedError = undefined;
    reader._closedPromise = new Promise((resolve, reject) => {
      reader._closedPromise_resolve = resolve;
      reader._closedPromise_reject = reject;
    });
  } else {
    reader._ownerReadableByteStream = undefined;

    if (stream._state === 'closed') {
      reader._storedError = undefined;

      reader._closedPromise = Promise.resolve(undefined);
      reader._closedPromise_resolve = undefined;
      reader._closedPromise_reject = undefined;
    } else {
      assert$5(stream._state === 'errored', 'state must be errored');

      reader._storedError = stream._storedError;

      reader._closedPromise = Promise.reject(stream._storedError);
      reader._closedPromise_resolve = undefined;
      reader._closedPromise_reject = undefined;
    }
  }
}

function IsReadableByteStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controller')) {
    return false;
  }

  return true;
}

function IsReadableByteStreamByobReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
    return false;
  }

  return true;
}

function IsReadableByteStreamController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableByteStream')) {
    return false;
  }

  return true;
}

function IsReadableByteStreamLocked(stream) {
  assert$5(IsReadableByteStream(stream),
         'IsReadableByteStreamLocked should only be used on known readable byte streams');

  if (stream._reader === undefined) {
    return false;
  }

  return true;
}

function IsReadableByteStreamReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
    return false;
  }

  return true;
}

function PullFromReadableByteStream(stream) {
  const controller = stream._controller;

  const reader = stream._reader;

  if (reader._readRequests.length > 1) {
    return;
  }

  assert$5(reader._readRequests.length === 1);

  if (controller._totalQueuedBytes > 0) {
    const entry = controller._queue.shift();
    controller._totalQueuedBytes -= entry.byteLength;

    const view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
    RespondToReadRequest(reader, view);

    if (controller._totalQueuedBytes === 0 && controller._closeRequested) {
      CloseReadableByteStream(stream);
    }

    return;
  }

  if (controller._pulling) {
    controller._pullAgain = true;
    return;
  }

  ReadableByteStreamControllerCallPull(controller);
  ReadableByteStreamControllerCallPullOrPullIntoRepeatedlyIfNeeded(controller);
}

function PullFromReadableByteStreamInto(stream, buffer, byteOffset, byteLength, elementSize) {
  const controller = stream._controller;

  const pullIntoDescriptor = {
    buffer,
    byteOffset,
    byteLength,
    bytesFilled: 0,
    elementSize
  };

  if (controller._pendingPullIntos.length > 0) {
    pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
    controller._pendingPullIntos.push(pullIntoDescriptor);

    return;
  }

  if (controller._totalQueuedBytes > 0) {
    const ready = FillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor);

    if (ready) {
      RespondToReadIntoRequest(stream._reader, pullIntoDescriptor.buffer, pullIntoDescriptor.bytesFilled);

      if (controller._totalQueuedBytes === 0 && controller._closeRequested) {
        CloseReadableByteStream(stream);
      }

      return;
    }

    if (controller._closeRequested) {
      DestroyReadableByteStreamController(controller);
      ErrorReadableByteStream(stream, new TypeError('Insufficient bytes to fill elements in the given buffer'));

      return;
    }
  }

  pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
  controller._pendingPullIntos.push(pullIntoDescriptor);

  if (controller._pulling) {
    controller._pullAgain = true;
    return;
  }

  ReadableByteStreamControllerCallPullInto(controller);
  ReadableByteStreamControllerCallPullOrPullIntoRepeatedlyIfNeeded(controller);
}

function RespondToByobReaderInClosedState(controller, reader, buffer) {
  const firstDescriptor = controller._pendingPullIntos[0];

  if (buffer !== undefined) {
    firstDescriptor.buffer = buffer;
  }

  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);

  assert$5(firstDescriptor.bytesFilled === 0, 'bytesFilled must be 0');

  while (reader._readIntoRequests.length > 0) {
    const descriptor = controller._pendingPullIntos.shift();
    RespondToReadIntoRequest(reader, descriptor.buffer);
  }

  ReleaseReadableByteStreamReaderGeneric(reader);
}

function RespondToByobReaderInReadableState(controller, reader, bytesWritten, buffer) {
  const pullIntoDescriptor = controller._pendingPullIntos[0];

  if (pullIntoDescriptor.bytesFilled + bytesWritten > pullIntoDescriptor.byteLength) {
    throw new RangeError('bytesWritten out of range');
  }

  if (buffer !== undefined) {
    pullIntoDescriptor.buffer = buffer;
  }

  pullIntoDescriptor.bytesFilled += bytesWritten;

  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    // TODO: Figure out whether we should detach the buffer or not here.
    ReadableByteStreamControllerCallPullOrPullIntoLaterIfNeeded(controller);
    return;
  }

  controller._pendingPullIntos.shift();

  const remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    const remainder = pullIntoDescriptor.buffer.slice(end - remainderSize, end);
    EnqueueInReadableByteStreamController(controller, remainder, 0, remainder.byteLength);
  }

  RespondToReadIntoRequest(
      reader, TransferArrayBuffer(pullIntoDescriptor.buffer), pullIntoDescriptor.bytesFilled - remainderSize);

  RespondToReadIntoRequestsFromQueue(controller, reader);
}

function RespondToReadIntoRequest(reader, buffer, length) {
  assert$5(reader._readIntoRequests.length > 0,
         'readIntoRequest must not be empty when calling RespondToReadIntoRequest');
  assert$5(reader._state !== 'errored', 'state must not be errored');

  const req = reader._readIntoRequests.shift();
  const ctor = req.ctor;
  const byteOffset = req.byteOffset;

  if (reader._state === 'closed') {
    assert$5(length === undefined);
    const view = new ctor(buffer, byteOffset, 0);
    req.resolve(CreateIterResultObject(view, true));

    return;
  }

  assert$5(length <= req.byteLength);
  assert$5(length % req.elementSize === 0);

  const view = new ctor(buffer, byteOffset, length / req.elementSize);
  req.resolve(CreateIterResultObject(view, false));
}

function RespondToReadRequest(reader, view) {
  const req = reader._readRequests.shift();
  req.resolve(CreateIterResultObject(view, false));
}

function RespondToReadIntoRequestsFromQueue(controller, reader) {
  assert$5(!controller._closeRequested);

  while (controller._pendingPullIntos.length > 0) {
    if (controller._totalQueuedBytes === 0) {
      ReadableByteStreamControllerCallPullOrPullIntoLaterIfNeeded(controller);
      return;
    }

    const pullIntoDescriptor = controller._pendingPullIntos[0];

    const ready = FillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor);

    if (ready) {
      controller._pendingPullIntos.shift();

      RespondToReadIntoRequest(reader, pullIntoDescriptor.buffer, pullIntoDescriptor.bytesFilled);
    }
  }
}

const interfaces = {
  ReadableByteStream,
  ReadableStream,
  WritableStream,
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  TransformStream
};

// Add classes to global
Object.assign( global, interfaces );

export default interfaces;