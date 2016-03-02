'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var assert$1 = require('assert');

function typeIsObject(x) {
  return (typeof x === 'undefined' ? 'undefined' : _typeof(x)) === 'object' && x !== null || typeof x === 'function';
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
  var obj = {};
  Object.defineProperty(obj, 'value', { value: value, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(obj, 'done', { value: done, enumerable: true, writable: true, configurable: true });
  return obj;
}

function InvokeOrNoop(O, P, args) {
  var method = O[P];
  if (method === undefined) {
    return undefined;
  }
  return method.apply(O, args);
}

function PromiseInvokeOrNoop(O, P, args) {
  var method = undefined;
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
  var method = undefined;
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

  return { size: size, highWaterMark: highWaterMark };
}

var assert$2 = require('assert');

function rethrowAssertionErrorRejection(e) {
  // Used throughout the reference implementation, as `.catch(rethrowAssertionErrorRejection)`, to ensure any errors
  // get shown. There are places in the spec where we do promise transformations and purposefully ignore or don't
  // expect any errors, but assertion errors are always problematic.
  if (e && e.constructor === assert$2.AssertionError) {
    setTimeout(function () {
      throw e;
    }, 0);
  }
}

var assert$3 = require('assert');

function DequeueValue(queue) {
  assert$3(queue.length > 0, 'Spec-level failure: should never dequeue from an empty queue.');
  var pair = queue.shift();
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
  var totalSize = 0;

  queue.forEach(function (pair) {
    assert$3(typeof pair.size === 'number' && !Number.isNaN(pair.size) && pair.size !== +Infinity && pair.size !== -Infinity, 'Spec-level failure: should never find an invalid size in the queue.');
    totalSize += pair.size;
  });

  return totalSize;
}

function PeekQueueValue(queue) {
  assert$3(queue.length > 0, 'Spec-level failure: should never peek at an empty queue.');
  var pair = queue[0];
  return pair.value;
}

var assert = require('assert');

var ReadableStream = function () {
  function ReadableStream() {
    var _this = this;

    var underlyingSource = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var _ref = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var size = _ref.size;
    var _ref$highWaterMark = _ref.highWaterMark;
    var highWaterMark = _ref$highWaterMark === undefined ? 1 : _ref$highWaterMark;

    _classCallCheck(this, ReadableStream);

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

    var normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    this._controller = new ReadableStreamController(this);

    var startResult = InvokeOrNoop(underlyingSource, 'start', [this._controller]);
    Promise.resolve(startResult).then(function () {
      _this._started = true;
      RequestReadableStreamPull(_this);
    }, function (r) {
      if (_this._state === 'readable') {
        return ErrorReadableStream(_this, r);
      }
    }).catch(rethrowAssertionErrorRejection);
  }

  _createClass(ReadableStream, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (IsReadableStream(this) === false) {
        return Promise.reject(new TypeError('ReadableStream.prototype.cancel can only be used on a ReadableStream'));
      }

      if (IsReadableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
      }

      return CancelReadableStream(this, reason);
    }
  }, {
    key: 'getReader',
    value: function getReader() {
      if (IsReadableStream(this) === false) {
        throw new TypeError('ReadableStream.prototype.getReader can only be used on a ReadableStream');
      }

      return AcquireReadableStreamReader(this);
    }
  }, {
    key: 'pipeThrough',
    value: function pipeThrough(_ref2, options) {
      var writable = _ref2.writable;
      var readable = _ref2.readable;

      this.pipeTo(writable, options);
      return readable;
    }
  }, {
    key: 'pipeTo',
    value: function pipeTo(dest) {
      var _ref3 = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var preventClose = _ref3.preventClose;
      var preventAbort = _ref3.preventAbort;
      var preventCancel = _ref3.preventCancel;

      preventClose = Boolean(preventClose);
      preventAbort = Boolean(preventAbort);
      preventCancel = Boolean(preventCancel);

      var source = this;

      var reader = undefined;
      var lastRead = undefined;
      var lastWrite = undefined;
      var closedPurposefully = false;
      var resolvePipeToPromise = undefined;
      var rejectPipeToPromise = undefined;

      return new Promise(function (resolve, reject) {
        resolvePipeToPromise = resolve;
        rejectPipeToPromise = reject;

        reader = source.getReader();

        reader.closed.catch(abortDest);
        dest.closed.then(function () {
          if (!closedPurposefully) {
            cancelSource(new TypeError('destination is closing or closed and cannot be piped to anymore'));
          }
        }, cancelSource);

        doPipe();
      });

      function doPipe() {
        lastRead = reader.read();
        Promise.all([lastRead, dest.ready]).then(function (_ref4) {
          var _ref5 = _slicedToArray(_ref4, 1);

          var _ref5$ = _ref5[0];
          var value = _ref5$.value;
          var done = _ref5$.done;

          if (Boolean(done) === true) {
            closeDest();
          } else if (dest.state === 'writable') {
            lastWrite = dest.write(value);
            doPipe();
          }
        }).catch(rethrowAssertionErrorRejection);

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
          lastRead.then(function () {
            reader.releaseLock();
            rejectPipeToPromise(reason);
          });
        }
      }

      function closeDest() {
        // Does not need to wait for lastRead since it occurs only on source closed.

        reader.releaseLock();

        var destState = dest.state;
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
  }, {
    key: 'tee',
    value: function tee() {
      if (IsReadableStream(this) === false) {
        throw new TypeError('ReadableStream.prototype.tee can only be used on a ReadableStream');
      }

      var branches = TeeReadableStream(this, false);
      return createArrayFromList(branches);
    }
  }, {
    key: 'locked',
    get: function get() {
      if (IsReadableStream(this) === false) {
        throw new TypeError('ReadableStream.prototype.locked can only be used on a ReadableStream');
      }

      return IsReadableStreamLocked(this);
    }
  }]);

  return ReadableStream;
}();

var ReadableStreamController = function () {
  function ReadableStreamController(stream) {
    _classCallCheck(this, ReadableStreamController);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamController can only be constructed with a ReadableStream instance');
    }

    if (stream._controller !== undefined) {
      throw new TypeError('ReadableStreamController instances can only be created by the ReadableStream constructor');
    }

    this._controlledReadableStream = stream;
  }

  _createClass(ReadableStreamController, [{
    key: 'close',
    value: function close() {
      if (IsReadableStreamController(this) === false) {
        throw new TypeError('ReadableStreamController.prototype.close can only be used on a ReadableStreamController');
      }

      var stream = this._controlledReadableStream;

      if (stream._closeRequested === true) {
        throw new TypeError('The stream has already been closed; do not close it again!');
      }
      if (stream._state === 'errored') {
        throw new TypeError('The stream is in an errored state and cannot be closed');
      }

      return CloseReadableStream(stream);
    }
  }, {
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (IsReadableStreamController(this) === false) {
        throw new TypeError('ReadableStreamController.prototype.enqueue can only be used on a ReadableStreamController');
      }

      var stream = this._controlledReadableStream;

      if (stream._state === 'errored') {
        throw stream._storedError;
      }

      if (stream._closeRequested === true) {
        throw new TypeError('stream is closed or draining');
      }

      return EnqueueInReadableStream(stream, chunk);
    }
  }, {
    key: 'error',
    value: function error(e) {
      if (IsReadableStreamController(this) === false) {
        throw new TypeError('ReadableStreamController.prototype.error can only be used on a ReadableStreamController');
      }

      if (this._controlledReadableStream._state !== 'readable') {
        throw new TypeError('The stream is ' + this._controlledReadableStream._state + ' and so cannot be errored');
      }

      return ErrorReadableStream(this._controlledReadableStream, e);
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsReadableStreamController(this) === false) {
        throw new TypeError('ReadableStreamController.prototype.desiredSize can only be used on a ReadableStreamController');
      }

      return GetReadableStreamDesiredSize(this._controlledReadableStream);
    }
  }]);

  return ReadableStreamController;
}();

var ReadableStreamReader = function () {
  function ReadableStreamReader(stream) {
    var _this2 = this;

    _classCallCheck(this, ReadableStreamReader);

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
      this._closedPromise = new Promise(function (resolve, reject) {
        _this2._closedPromise_resolve = resolve;
        _this2._closedPromise_reject = reject;
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

  _createClass(ReadableStreamReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (IsReadableStreamReader(this) === false) {
        return Promise.reject(new TypeError('ReadableStreamReader.prototype.cancel can only be used on a ReadableStreamReader'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(new TypeError('Cannot cancel a stream using a released reader'));
      }

      return CancelReadableStream(this._ownerReadableStream, reason);
    }
  }, {
    key: 'read',
    value: function read() {
      if (IsReadableStreamReader(this) === false) {
        return Promise.reject(new TypeError('ReadableStreamReader.prototype.read can only be used on a ReadableStreamReader'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(new TypeError('Cannot read from a released reader'));
      }

      return ReadFromReadableStreamReader(this);
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
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
        this._closedPromise_reject(new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
      } else {
        this._closedPromise = Promise.reject(new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
      }

      this._ownerReadableStream._reader = undefined;
      this._ownerReadableStream = undefined;

      return undefined;
    }
  }, {
    key: 'closed',
    get: function get() {
      if (IsReadableStreamReader(this) === false) {
        return Promise.reject(new TypeError('ReadableStreamReader.prototype.closed can only be used on a ReadableStreamReader'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableStreamReader;
}();

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

  var sourceCancelPromise = PromiseInvokeOrNoop(stream._underlyingSource, 'cancel', [reason]);
  return sourceCancelPromise.then(function () {
    return undefined;
  });
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
    var readRequest = stream._reader._readRequests.shift();
    readRequest._resolve(CreateIterResultObject(chunk, false));
  } else {
    var chunkSize = 1;

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

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = reader._readRequests[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _reject = _step.value._reject;

      _reject(e);
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
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

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = reader._readRequests[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var _resolve = _step2.value._resolve;

      _resolve(CreateIterResultObject(undefined, true));
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }

  reader._readRequests = [];

  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;

  return undefined;
}

function GetReadableStreamDesiredSize(stream) {
  var queueSize = GetTotalQueueSize(stream._queue);
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
    var chunk = DequeueValue(reader._ownerReadableStream._queue);

    if (reader._ownerReadableStream._closeRequested === true && reader._ownerReadableStream._queue.length === 0) {
      FinishClosingReadableStream(reader._ownerReadableStream);
    } else {
      RequestReadableStreamPull(reader._ownerReadableStream);
    }

    return Promise.resolve(CreateIterResultObject(chunk, false));
  } else {
    var _ret = function () {
      var readRequest = {};
      readRequest.promise = new Promise(function (resolve, reject) {
        readRequest._resolve = resolve;
        readRequest._reject = reject;
      });

      reader._readRequests.push(readRequest);
      RequestReadableStreamPull(reader._ownerReadableStream);
      return {
        v: readRequest.promise
      };
    }();

    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
  }
}

function RequestReadableStreamPull(stream) {
  var shouldPull = ShouldReadableStreamPull(stream);
  if (shouldPull === false) {
    return undefined;
  }

  if (stream._pulling === true) {
    stream._pullAgain = true;
    return undefined;
  }

  stream._pulling = true;
  var pullPromise = PromiseInvokeOrNoop(stream._underlyingSource, 'pull', [stream._controller]);
  pullPromise.then(function () {
    stream._pulling = false;

    if (stream._pullAgain === true) {
      stream._pullAgain = false;
      return RequestReadableStreamPull(stream);
    }
  }, function (e) {
    if (stream._state === 'readable') {
      return ErrorReadableStream(stream, e);
    }
  }).catch(rethrowAssertionErrorRejection);

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

  var desiredSize = GetReadableStreamDesiredSize(stream);
  if (desiredSize > 0) {
    return true;
  }

  return false;
}

function TeeReadableStream(stream, shouldClone) {
  assert(IsReadableStream(stream) === true);
  assert(typeof shouldClone === 'boolean');

  var reader = AcquireReadableStreamReader(stream);

  var teeState = {
    closedOrErrored: false,
    canceled1: false,
    canceled2: false,
    reason1: undefined,
    reason2: undefined
  };
  teeState.promise = new Promise(function (resolve) {
    return teeState._resolve = resolve;
  });

  var pull = create_TeeReadableStreamPullFunction();
  pull._reader = reader;
  pull._teeState = teeState;
  pull._shouldClone = shouldClone;

  var cancel1 = create_TeeReadableStreamBranch1CancelFunction();
  cancel1._stream = stream;
  cancel1._teeState = teeState;

  var cancel2 = create_TeeReadableStreamBranch2CancelFunction();
  cancel2._stream = stream;
  cancel2._teeState = teeState;

  var underlyingSource1 = Object.create(Object.prototype);
  createDataProperty(underlyingSource1, 'pull', pull);
  createDataProperty(underlyingSource1, 'cancel', cancel1);
  var branch1 = new ReadableStream(underlyingSource1);

  var underlyingSource2 = Object.create(Object.prototype);
  createDataProperty(underlyingSource2, 'pull', pull);
  createDataProperty(underlyingSource2, 'cancel', cancel2);
  var branch2 = new ReadableStream(underlyingSource2);

  pull._branch1 = branch1;
  pull._branch2 = branch2;

  reader._closedPromise.catch(function (r) {
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
  var f = function f() {
    var reader = f._reader;
    var branch1 = f._branch1;
    var branch2 = f._branch2;
    var teeState = f._teeState;
    var shouldClone = f._shouldClone;


    return ReadFromReadableStreamReader(reader).then(function (result) {
      assert(typeIsObject(result));
      var value = result.value;
      var done = result.done;
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
        var value1 = value;
        //        if (shouldClone === true) {
        //          value1 = StructuredClone(value);
        //        }
        EnqueueInReadableStream(branch1, value1);
      }

      if (teeState.canceled2 === false) {
        var value2 = value;
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
  var f = function f(reason) {
    var stream = f._stream;
    var teeState = f._teeState;


    teeState.canceled1 = true;
    teeState.reason1 = reason;
    if (teeState.canceled2 === true) {
      var compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      var cancelResult = CancelReadableStream(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

function create_TeeReadableStreamBranch2CancelFunction() {
  var f = function f(reason) {
    var stream = f._stream;
    var teeState = f._teeState;


    teeState.canceled2 = true;
    teeState.reason2 = reason;
    if (teeState.canceled1 === true) {
      var compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      var cancelResult = CancelReadableStream(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

var CountQueuingStrategy = function () {
  function CountQueuingStrategy(_ref6) {
    var highWaterMark = _ref6.highWaterMark;

    _classCallCheck(this, CountQueuingStrategy);

    createDataProperty(this, 'highWaterMark', highWaterMark);
  }

  _createClass(CountQueuingStrategy, [{
    key: 'size',
    value: function size(chunk) {
      return 1;
    }
  }]);

  return CountQueuingStrategy;
}();

var assert$4 = require('assert');

var WritableStream = function () {
  function WritableStream() {
    var _this3 = this;

    var underlyingSink = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var _ref7 = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var size = _ref7.size;
    var _ref7$highWaterMark = _ref7.highWaterMark;
    var highWaterMark = _ref7$highWaterMark === undefined ? 0 : _ref7$highWaterMark;

    _classCallCheck(this, WritableStream);

    this._underlyingSink = underlyingSink;

    this._closedPromise = new Promise(function (resolve, reject) {
      _this3._closedPromise_resolve = resolve;
      _this3._closedPromise_reject = reject;
    });

    this._readyPromise = Promise.resolve(undefined);
    this._readyPromise_resolve = null;

    this._queue = [];
    this._state = 'writable';
    this._started = false;
    this._writing = false;

    var normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    SyncWritableStreamStateWithQueue(this);

    var error = closure_WritableStreamErrorFunction();
    error._stream = this;

    var startResult = InvokeOrNoop(underlyingSink, 'start', [error]);
    this._startedPromise = Promise.resolve(startResult);
    this._startedPromise.then(function () {
      _this3._started = true;
      _this3._startedPromise = undefined;
    });
    this._startedPromise.catch(function (r) {
      return ErrorWritableStream(_this3, r);
    }).catch(rethrowAssertionErrorRejection);
  }

  _createClass(WritableStream, [{
    key: 'abort',
    value: function abort(reason) {
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
      var sinkAbortPromise = PromiseInvokeOrFallbackOrNoop(this._underlyingSink, 'abort', [reason], 'close', []);
      return sinkAbortPromise.then(function () {
        return undefined;
      });
    }
  }, {
    key: 'close',
    value: function close() {
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
  }, {
    key: 'write',
    value: function write(chunk) {
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

      var chunkSize = 1;

      if (this._strategySize !== undefined) {
        try {
          chunkSize = this._strategySize(chunk);
        } catch (chunkSizeE) {
          ErrorWritableStream(this, chunkSizeE);
          return Promise.reject(chunkSizeE);
        }
      }

      var resolver = undefined,
          rejecter = undefined;
      var promise = new Promise(function (resolve, reject) {
        resolver = resolve;
        rejecter = reject;
      });

      var writeRecord = { promise: promise, chunk: chunk, _resolve: resolver, _reject: rejecter };
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
  }, {
    key: 'closed',
    get: function get() {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.closed can only be used on a WritableStream'));
      }

      return this._closedPromise;
    }
  }, {
    key: 'state',
    get: function get() {
      if (!IsWritableStream(this)) {
        throw new TypeError('WritableStream.prototype.state can only be used on a WritableStream');
      }

      return this._state;
    }
  }, {
    key: 'ready',
    get: function get() {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.ready can only be used on a WritableStream'));
      }

      return this._readyPromise;
    }
  }]);

  return WritableStream;
}();

function closure_WritableStreamErrorFunction() {
  var f = function f(e) {
    return ErrorWritableStream(f._stream, e);
  };
  return f;
}

function CallOrScheduleWritableStreamAdvanceQueue(stream) {
  if (stream._started === false) {
    stream._startedPromise.then(function () {
      WritableStreamAdvanceQueue(stream);
    }).catch(rethrowAssertionErrorRejection);
    return undefined;
  }

  if (stream._started === true) {
    return WritableStreamAdvanceQueue(stream);
  }
}

function CloseWritableStream(stream) {
  assert$4(stream._state === 'closing', 'stream must be in closing state while calling CloseWritableStream');

  var sinkClosePromise = PromiseInvokeOrNoop(stream._underlyingSink, 'close');
  sinkClosePromise.then(function () {
    if (stream._state === 'errored') {
      return;
    }

    assert$4(stream._state === 'closing');

    stream._closedPromise_resolve(undefined);
    stream._closedPromise_resolve = undefined;
    stream._closedPromise_reject = undefined;
    stream._state = 'closed';
  }, function (r) {
    return ErrorWritableStream(stream, r);
  }).catch(rethrowAssertionErrorRejection);
}

function ErrorWritableStream(stream, e) {
  if (stream._state === 'closed' || stream._state === 'errored') {
    return undefined;
  }

  while (stream._queue.length > 0) {
    var writeRecord = DequeueValue(stream._queue);
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

  assert$4(stream._state === 'writable' || stream._state === 'waiting', 'stream must be in a writable or waiting state while calling SyncWritableStreamStateWithQueue');

  var queueSize = GetTotalQueueSize(stream._queue);
  var shouldApplyBackpressure = queueSize > stream._strategyHWM;

  if (shouldApplyBackpressure === true && stream._state === 'writable') {
    stream._state = 'waiting';
    stream._readyPromise = new Promise(function (resolve, reject) {
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

  var writeRecord = PeekQueueValue(stream._queue);

  if (writeRecord === 'close') {
    assert$4(stream._state === 'closing', 'can\'t process final write record unless already closing');
    DequeueValue(stream._queue);
    assert$4(stream._queue.length === 0, 'queue must be empty once the final write record is dequeued');
    return CloseWritableStream(stream);
  } else {
    stream._writing = true;

    PromiseInvokeOrNoop(stream._underlyingSink, 'write', [writeRecord.chunk]).then(function () {
      if (stream._state === 'errored') {
        return;
      }

      stream._writing = false;

      writeRecord._resolve(undefined);

      DequeueValue(stream._queue);
      SyncWritableStreamStateWithQueue(stream);
      WritableStreamAdvanceQueue(stream);
    }, function (r) {
      return ErrorWritableStream(stream, r);
    }).catch(rethrowAssertionErrorRejection);
  }
}

var ByteLengthQueuingStrategy = function () {
  function ByteLengthQueuingStrategy(_ref8) {
    var highWaterMark = _ref8.highWaterMark;

    _classCallCheck(this, ByteLengthQueuingStrategy);

    createDataProperty(this, 'highWaterMark', highWaterMark);
  }

  _createClass(ByteLengthQueuingStrategy, [{
    key: 'size',
    value: function size(chunk) {
      return chunk.byteLength;
    }
  }]);

  return ByteLengthQueuingStrategy;
}();

var TransformStream = function TransformStream(transformer) {
  _classCallCheck(this, TransformStream);

  if (transformer.flush === undefined) {
    transformer.flush = function (enqueue, close) {
      return close();
    };
  }

  if (typeof transformer.transform !== 'function') {
    throw new TypeError('transform must be a function');
  }

  var writeChunk = undefined,
      writeDone = undefined,
      errorWritable = undefined;
  var transforming = false;
  var chunkWrittenButNotYetTransformed = false;
  this.writable = new WritableStream({
    start: function start(error) {
      errorWritable = error;
    },
    write: function write(chunk) {
      writeChunk = chunk;
      chunkWrittenButNotYetTransformed = true;

      var p = new Promise(function (resolve) {
        return writeDone = resolve;
      });
      maybeDoTransform();
      return p;
    },
    close: function close() {
      try {
        transformer.flush(enqueueInReadable, closeReadable);
      } catch (e) {
        errorWritable(e);
        errorReadable(e);
      }
    }
  }, transformer.writableStrategy);

  var enqueueInReadable = undefined,
      closeReadable = undefined,
      errorReadable = undefined;
  this.readable = new ReadableStream({
    start: function start(c) {
      enqueueInReadable = c.enqueue.bind(c);
      closeReadable = c.close.bind(c);
      errorReadable = c.error.bind(c);
    },
    pull: function pull() {
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
};

var assert$5 = require('assert');

var ReadableByteStream = function () {
  function ReadableByteStream() {
    var underlyingByteSource = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, ReadableByteStream);

    this._state = 'readable';
    this._reader = undefined;
    this._storedError = undefined;

    // Initialize to undefined first because the constructor of the ReadableByteStreamController checks this
    // variable to validate the caller.
    this._controller = undefined;
    this._controller = new ReadableByteStreamController(this, underlyingByteSource);
  }

  _createClass(ReadableByteStream, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (IsReadableByteStream(this) === false) {
        return Promise.reject(new TypeError('ReadableByteStream.prototype.cancel can only be used on a ReadableByteStream'));
      }

      if (IsReadableByteStreamLocked(this) === true) {
        return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
      }

      return CancelReadableByteStream(this, reason);
    }
  }, {
    key: 'getByobReader',
    value: function getByobReader() {
      if (IsReadableByteStream(this) === false) {
        throw new TypeError('ReadableByteStream.prototype.getByobReader can only be used on a ReadableByteStream');
      }

      return new ReadableByteStreamByobReader(this);
    }
  }, {
    key: 'getReader',
    value: function getReader() {
      if (IsReadableByteStream(this) === false) {
        throw new TypeError('ReadableByteStream.prototype.getReader can only be used on a ReadableByteStream');
      }

      return new ReadableByteStreamReader(this);
    }
  }]);

  return ReadableByteStream;
}();

var ReadableByteStreamController = function () {
  function ReadableByteStreamController(controlledReadableByteStream, underlyingByteSource) {
    _classCallCheck(this, ReadableByteStreamController);

    if (IsReadableByteStream(controlledReadableByteStream) === false) {
      throw new TypeError('ReadableByteStreamController can only be constructed with a ReadableByteStream instance');
    }

    if (controlledReadableByteStream._controller !== undefined) {
      throw new TypeError('ReadableByteStreamController instances can only be created by the ReadableByteStream constructor');
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

  _createClass(ReadableByteStreamController, [{
    key: 'close',
    value: function close() {
      if (!IsReadableByteStreamController(this)) {
        throw new TypeError('ReadableByteStreamController.prototype.close can only be used on a ReadableByteStreamController');
      }

      var stream = this._controlledReadableByteStream;

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

      var reader = stream._reader;

      if (IsReadableByteStreamByobReader(reader) && this._pendingPullIntos.length > 0) {
        var pullInto = this._pendingPullIntos[0];
        if (pullInto.bytesFilled > 0) {
          DestroyReadableByteStreamController(this);
          var e = new TypeError('Insufficient bytes to fill elements in the given buffer');
          ErrorReadableByteStream(stream, e);

          throw e;
        }
      }

      CloseReadableByteStream(stream);
    }
  }, {
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (!IsReadableByteStreamController(this)) {
        throw new TypeError('ReadableByteStreamController.prototype.enqueue can only be used on a ReadableByteStreamController');
      }

      var stream = this._controlledReadableByteStream;

      if (this._closeRequested) {
        throw new TypeError('stream is closed or draining');
      }
      if (stream._state !== 'readable') {
        throw new TypeError('The stream is not in the readable state and cannot be enqueued to');
      }

      var reader = stream._reader;

      var buffer = chunk.buffer;
      var byteOffset = chunk.byteOffset;
      var byteLength = chunk.byteLength;

      if (reader === undefined) {
        EnqueueInReadableByteStreamController(this, TransferArrayBuffer(buffer), byteOffset, byteLength);
      } else {
        if (IsReadableByteStreamReader(reader)) {
          if (reader._readRequests.length === 0) {
            EnqueueInReadableByteStreamController(this, TransferArrayBuffer(buffer), byteOffset, byteLength);
          } else {
            assert$5(this._queue.length === 0);

            var transferredView = new Uint8Array(TransferArrayBuffer(buffer), byteOffset, byteLength);
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
  }, {
    key: 'error',
    value: function error(e) {
      if (!IsReadableByteStreamController(this)) {
        throw new TypeError('ReadableByteStreamController.prototype.error can only be used on a ReadableByteStreamController');
      }

      var stream = this._controlledReadableByteStream;

      if (stream._state !== 'readable') {
        throw new TypeError('The stream is ' + stream._state + ' and so cannot be errored');
      }

      DestroyReadableByteStreamController(this);
      ErrorReadableByteStream(stream, e);
    }
  }, {
    key: 'respond',
    value: function respond(bytesWritten, buffer) {
      if (!IsReadableByteStreamController(this)) {
        throw new TypeError('ReadableByteStreamController.prototype.respond can only be used on a ReadableByteStreamController');
      }

      var stream = this._controlledReadableByteStream;

      if (this._pendingPullIntos.length === 0) {
        throw new TypeError('No pending BYOB read');
      }

      assert$5(IsReadableByteStreamLocked(stream), 'stream must be locked');

      var reader = stream._reader;

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
  }]);

  return ReadableByteStreamController;
}();

var ReadableByteStreamReader = function () {
  function ReadableByteStreamReader(stream) {
    _classCallCheck(this, ReadableByteStreamReader);

    if (!IsReadableByteStream(stream)) {
      throw new TypeError('ReadableByteStreamReader can only be constructed with a ReadableByteStream instance');
    }
    if (IsReadableByteStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    InitializeReadableByteStreamReaderGeneric(this, stream);

    this._readRequests = [];
  }

  _createClass(ReadableByteStreamReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (!IsReadableByteStreamReader(this)) {
        return Promise.reject(new TypeError('ReadableByteStreamReader.prototype.cancel can only be used on a ReadableByteStreamReader'));
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
  }, {
    key: 'read',
    value: function read() {
      var _this4 = this;

      if (!IsReadableByteStreamReader(this)) {
        return Promise.reject(new TypeError('ReadableByteStreamReader.prototype.read can only be used on a ReadableByteStreamReader'));
      }

      if (this._state === 'closed') {
        return Promise.resolve(CreateIterResultObject(undefined, true));
      }

      if (this._state === 'errored') {
        return Promise.reject(this._storedError);
      }

      assert$5(this._ownerReadableByteStream !== undefined, 'This reader must be attached to a stream');
      assert$5(this._ownerReadableByteStream._state === 'readable', 'The owner stream must be in readable state');

      var promise = new Promise(function (resolve, reject) {
        _this4._readRequests.push({ resolve: resolve, reject: reject });
      });

      PullFromReadableByteStream(this._ownerReadableByteStream);

      return promise;
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (!IsReadableByteStreamReader(this)) {
        throw new TypeError('ReadableByteStreamReader.prototype.releaseLock can only be used on a ReadableByteStreamReader');
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
  }, {
    key: 'closed',
    get: function get() {
      if (!IsReadableByteStreamReader(this)) {
        return Promise.reject(new TypeError('ReadableByteStreamReader.prototype.closed can only be used on a ReadableByteStreamReader'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableByteStreamReader;
}();

var ReadableByteStreamByobReader = function () {
  function ReadableByteStreamByobReader(stream) {
    _classCallCheck(this, ReadableByteStreamByobReader);

    if (!IsReadableByteStream(stream)) {
      throw new TypeError('ReadableByteStreamByobReader can only be constructed with a ReadableByteStream instance');
    }
    if (IsReadableByteStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    InitializeReadableByteStreamReaderGeneric(this, stream);

    this._readIntoRequests = [];
  }

  _createClass(ReadableByteStreamByobReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (!IsReadableByteStreamByobReader(this)) {
        return Promise.reject(new TypeError('ReadableByteStreamByobReader.prototype.cancel can only be used on a ReadableByteStreamByobReader'));
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
  }, {
    key: 'read',
    value: function read(view) {
      var _this5 = this;

      if (!IsReadableByteStreamByobReader(this)) {
        return Promise.reject(new TypeError('ReadableByteStreamByobReader.prototype.read can only be used on a ReadableByteStreamByobReader'));
      }

      if (view === undefined || !ArrayBuffer.isView(view)) {
        return Promise.reject(new TypeError('Valid view must be provided'));
      }

      var ctor = view.constructor;
      var elementSize = 1;
      if (ctor === Int16Array || ctor === Uint16Array || ctor === Int32Array || ctor === Uint32Array || ctor === Float32Array || ctor === Float64Array || ctor === Int8Array || ctor === Uint8Array || ctor === Uint8ClampedArray) {
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

      var promise = new Promise(function (resolve, reject) {
        var req = {
          resolve: resolve,
          reject: reject,
          byteOffset: view.byteOffset,
          byteLength: view.byteLength,
          ctor: ctor,
          elementSize: elementSize
        };
        _this5._readIntoRequests.push(req);
      });

      PullFromReadableByteStreamInto(this._ownerReadableByteStream, view.buffer, view.byteOffset, view.byteLength, elementSize);

      return promise;
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (!IsReadableByteStreamByobReader(this)) {
        throw new TypeError('ReadableByteStreamByobReader.prototype.releaseLock can only be used on a ReadableByteStreamByobReader');
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
  }, {
    key: 'closed',
    get: function get() {
      if (!IsReadableByteStreamByobReader(this)) {
        return Promise.reject(new TypeError('ReadableByteStreamByobReader.prototype.closed can only be used on a ReadableByteStreamByobReader'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableByteStreamByobReader;
}();

function ReadableByteStreamControllerCallPull(controller) {
  var stream = controller._controlledReadableByteStream;

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
  var stream = controller._controlledReadableByteStream;

  assert$5(controller._pendingPullIntos.length > 0);
  var pullIntoDescriptor = controller._pendingPullIntos[0];

  controller._pullAgain = false;
  controller._pulling = true;

  try {
    InvokeOrNoop(controller._underlyingByteSource, 'pullInto', [new Uint8Array(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled, pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled)]);
  } catch (e) {
    DestroyReadableByteStreamController(controller);
    var _stream = controller._controlledReadableByteStream;
    if (_stream._state === 'readable') {
      ErrorReadableByteStream(_stream, e);
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
  var stream = controller._controlledReadableByteStream;

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

    var reader = stream._reader;

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

  var sourceCancelPromise = CancelReadableByteStreamController(stream._controller, reason);
  return sourceCancelPromise.then(function () {
    return undefined;
  });
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

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableByteStreamReader(reader)) {
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = reader._readRequests[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var req = _step3.value;

        req.resolve(CreateIterResultObject(undefined, true));
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
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
  controller._pendingPullIntos = [];
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
  controller._queue.push({ buffer: buffer, byteOffset: byteOffset, byteLength: byteLength });
  controller._totalQueuedBytes += byteLength;
}

function ErrorReadableByteStream(stream, e) {
  assert$5(IsReadableByteStream(stream), 'stream must be ReadableByteStream');
  assert$5(stream._state === 'readable', 'state must be readable');

  stream._state = 'errored';
  stream._storedError = e;

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableByteStreamReader(reader)) {
    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
      for (var _iterator4 = reader._readRequests[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
        var req = _step4.value;

        req.reject(e);
      }
    } catch (err) {
      _didIteratorError4 = true;
      _iteratorError4 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion4 && _iterator4.return) {
          _iterator4.return();
        }
      } finally {
        if (_didIteratorError4) {
          throw _iteratorError4;
        }
      }
    }

    reader._readRequests = [];
  } else {
    assert$5(IsReadableByteStreamByobReader(reader), 'reader must be ReadableByteStreamByobReader');

    var _iteratorNormalCompletion5 = true;
    var _didIteratorError5 = false;
    var _iteratorError5 = undefined;

    try {
      for (var _iterator5 = reader._readIntoRequests[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
        var req = _step5.value;

        req.reject(e);
      }
    } catch (err) {
      _didIteratorError5 = true;
      _iteratorError5 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion5 && _iterator5.return) {
          _iterator5.return();
        }
      } finally {
        if (_didIteratorError5) {
          throw _iteratorError5;
        }
      }
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
  var elementSize = pullIntoDescriptor.elementSize;

  var currentAlignedBytes = pullIntoDescriptor.bytesFilled - pullIntoDescriptor.bytesFilled % elementSize;

  var maxBytesToCopy = Math.min(controller._totalQueuedBytes, pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
  var maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
  var maxAlignedBytes = maxBytesFilled - maxBytesFilled % elementSize;

  var totalBytesToCopyRemaining = maxBytesToCopy;
  var ready = false;
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }

  var queue = controller._queue;

  while (totalBytesToCopyRemaining > 0) {
    var headOfQueue = queue[0];

    var bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);

    var destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    new Uint8Array(pullIntoDescriptor.buffer).set(new Uint8Array(headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy), destStart);

    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller._totalQueuedBytes -= bytesToCopy;

    pullIntoDescriptor.bytesFilled += bytesToCopy;

    totalBytesToCopyRemaining -= bytesToCopy;
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
    reader._closedPromise = new Promise(function (resolve, reject) {
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
  assert$5(IsReadableByteStream(stream), 'IsReadableByteStreamLocked should only be used on known readable byte streams');

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
  var controller = stream._controller;

  var reader = stream._reader;

  if (reader._readRequests.length > 1) {
    return;
  }

  assert$5(reader._readRequests.length === 1);

  if (controller._totalQueuedBytes > 0) {
    var entry = controller._queue.shift();
    controller._totalQueuedBytes -= entry.byteLength;

    var view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
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
  var controller = stream._controller;

  var pullIntoDescriptor = {
    buffer: buffer,
    byteOffset: byteOffset,
    byteLength: byteLength,
    bytesFilled: 0,
    elementSize: elementSize
  };

  if (controller._pendingPullIntos.length > 0) {
    pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
    controller._pendingPullIntos.push(pullIntoDescriptor);

    return;
  }

  if (controller._totalQueuedBytes > 0) {
    var ready = FillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor);

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
  var firstDescriptor = controller._pendingPullIntos[0];

  if (buffer !== undefined) {
    firstDescriptor.buffer = buffer;
  }

  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);

  assert$5(firstDescriptor.bytesFilled === 0, 'bytesFilled must be 0');

  while (reader._readIntoRequests.length > 0) {
    var descriptor = controller._pendingPullIntos.shift();
    RespondToReadIntoRequest(reader, descriptor.buffer);
  }

  ReleaseReadableByteStreamReaderGeneric(reader);
}

function RespondToByobReaderInReadableState(controller, reader, bytesWritten, buffer) {
  var pullIntoDescriptor = controller._pendingPullIntos[0];

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

  var remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    var end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    var remainder = pullIntoDescriptor.buffer.slice(end - remainderSize, end);
    EnqueueInReadableByteStreamController(controller, remainder, 0, remainder.byteLength);
  }

  RespondToReadIntoRequest(reader, TransferArrayBuffer(pullIntoDescriptor.buffer), pullIntoDescriptor.bytesFilled - remainderSize);

  RespondToReadIntoRequestsFromQueue(controller, reader);
}

function RespondToReadIntoRequest(reader, buffer, length) {
  assert$5(reader._readIntoRequests.length > 0, 'readIntoRequest must not be empty when calling RespondToReadIntoRequest');
  assert$5(reader._state !== 'errored', 'state must not be errored');

  var req = reader._readIntoRequests.shift();
  var ctor = req.ctor;
  var byteOffset = req.byteOffset;

  if (reader._state === 'closed') {
    assert$5(length === undefined);
    var _view = new ctor(buffer, byteOffset, 0);
    req.resolve(CreateIterResultObject(_view, true));

    return;
  }

  assert$5(length <= req.byteLength);
  assert$5(length % req.elementSize === 0);

  var view = new ctor(buffer, byteOffset, length / req.elementSize);
  req.resolve(CreateIterResultObject(view, false));
}

function RespondToReadRequest(reader, view) {
  var req = reader._readRequests.shift();
  req.resolve(CreateIterResultObject(view, false));
}

function RespondToReadIntoRequestsFromQueue(controller, reader) {
  assert$5(!controller._closeRequested);

  while (controller._pendingPullIntos.length > 0) {
    if (controller._totalQueuedBytes === 0) {
      ReadableByteStreamControllerCallPullOrPullIntoLaterIfNeeded(controller);
      return;
    }

    var pullIntoDescriptor = controller._pendingPullIntos[0];

    var ready = FillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor);

    if (ready) {
      controller._pendingPullIntos.shift();

      RespondToReadIntoRequest(reader, pullIntoDescriptor.buffer, pullIntoDescriptor.bytesFilled);
    }
  }
}

var interfaces = {
  ReadableByteStream: ReadableByteStream,
  ReadableStream: ReadableStream,
  WritableStream: WritableStream,
  ByteLengthQueuingStrategy: ByteLengthQueuingStrategy,
  CountQueuingStrategy: CountQueuingStrategy,
  TransformStream: TransformStream
};

// Add classes to global
Object.assign(global, interfaces);

exports.default = interfaces;
