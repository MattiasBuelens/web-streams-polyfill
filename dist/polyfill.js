(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.default = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _require = require('./spec/reference-implementation/lib/readable-stream');

var ReadableStream = _require.ReadableStream;

var _require2 = require('./spec/reference-implementation/lib/writable-stream');

var WritableStream = _require2.WritableStream;
var ByteLengthQueuingStrategy = require('./spec/reference-implementation/lib/byte-length-queuing-strategy');
var CountQueuingStrategy = require('./spec/reference-implementation/lib/count-queuing-strategy');
var TransformStream = require('./spec/reference-implementation/lib/transform-stream');exports.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
exports.CountQueuingStrategy = CountQueuingStrategy;
exports.TransformStream = TransformStream;
exports.ReadableStream = ReadableStream;
exports.WritableStream = WritableStream;


var interfaces = {
  ReadableStream: ReadableStream,
  WritableStream: WritableStream,
  ByteLengthQueuingStrategy: ByteLengthQueuingStrategy,
  CountQueuingStrategy: CountQueuingStrategy,
  TransformStream: TransformStream
};

// Export
exports.default = interfaces;

// Add classes to window

if (typeof window !== "undefined") Object.assign(window, interfaces);

},{"./spec/reference-implementation/lib/byte-length-queuing-strategy":7,"./spec/reference-implementation/lib/count-queuing-strategy":8,"./spec/reference-implementation/lib/readable-stream":11,"./spec/reference-implementation/lib/transform-stream":12,"./spec/reference-implementation/lib/writable-stream":14}],2:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && !isFinite(value)) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b)) {
    return a === b;
  }
  var aIsArgs = isArguments(a),
      bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  var ka = objectKeys(a),
      kb = objectKeys(b),
      key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":6}],3:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],4:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

(function () {
  try {
    cachedSetTimeout = setTimeout;
  } catch (e) {
    cachedSetTimeout = function () {
      throw new Error('setTimeout is not defined');
    }
  }
  try {
    cachedClearTimeout = clearTimeout;
  } catch (e) {
    cachedClearTimeout = function () {
      throw new Error('clearTimeout is not defined');
    }
  }
} ())
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = cachedSetTimeout.call(null, cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    cachedClearTimeout.call(null, timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        cachedSetTimeout.call(null, drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],5:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],6:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":5,"_process":4,"inherits":3}],7:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('./helpers.js');

var createDataProperty = _require.createDataProperty;


module.exports = function () {
  function ByteLengthQueuingStrategy(_ref) {
    var highWaterMark = _ref.highWaterMark;

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

},{"./helpers.js":9}],8:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('./helpers.js');

var createDataProperty = _require.createDataProperty;


module.exports = function () {
  function CountQueuingStrategy(_ref) {
    var highWaterMark = _ref.highWaterMark;

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

},{"./helpers.js":9}],9:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var assert = require('assert');

exports.promiseCall = function (func) {
  for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    args[_key - 1] = arguments[_key];
  }

  try {
    return Promise.resolve(func.apply(undefined, args));
  } catch (e) {
    return Promise.reject(e);
  }
};

exports.typeIsObject = function (x) {
  return (typeof x === 'undefined' ? 'undefined' : _typeof(x)) === 'object' && x !== null || typeof x === 'function';
};

exports.toInteger = function (v) {
  v = Number(v);
  if (isNaN(v)) {
    return 0;
  }

  if (v < 0) {
    return -1 * Math.floor(Math.abs(v));
  }

  return Math.floor(Math.abs(v));
};

exports.createDataProperty = function (o, p, v) {
  assert(exports.typeIsObject(o));
  Object.defineProperty(o, p, { value: v, writable: true, enumerable: true, configurable: true });
};

exports.createArrayFromList = function (elements) {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice();
};

exports.ArrayBufferCopy = function (dest, destOffset, src, srcOffset, n) {
  new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
};

exports.CreateIterResultObject = function (value, done) {
  assert(typeof done === 'boolean');
  var obj = {};
  Object.defineProperty(obj, 'value', { value: value, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(obj, 'done', { value: done, enumerable: true, writable: true, configurable: true });
  return obj;
};

exports.IsFiniteNonNegativeNumber = function (v) {
  if (Number.isNaN(v)) {
    return false;
  }
  if (v === +Infinity) {
    return false;
  }
  if (v < 0) {
    return false;
  }

  return true;
};

exports.InvokeOrNoop = function (O, P, args) {
  var method = O[P];
  if (method === undefined) {
    return undefined;
  }
  return method.apply(O, args);
};

exports.PromiseInvokeOrNoop = function (O, P, args) {
  var method = void 0;
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
};

exports.PromiseInvokeOrFallbackOrNoop = function (O, P1, args1, P2, args2) {
  var method = void 0;
  try {
    method = O[P1];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return exports.PromiseInvokeOrNoop(O, P2, args2);
  }

  try {
    return Promise.resolve(method.apply(O, args1));
  } catch (e) {
    return Promise.reject(e);
  }
};

// Not implemented correctly
exports.SameRealmTransfer = function (O) {
  return O;
};

exports.ValidateAndNormalizeHighWaterMark = function (highWaterMark) {
  highWaterMark = Number(highWaterMark);
  if (Number.isNaN(highWaterMark) || highWaterMark < 0) {
    throw new RangeError('highWaterMark property of a queuing strategy must be nonnegative and non-NaN');
  }

  return highWaterMark;
};

exports.ValidateAndNormalizeQueuingStrategy = function (size, highWaterMark) {
  if (size !== undefined && typeof size !== 'function') {
    throw new TypeError('size property of a queuing strategy must be a function');
  }

  highWaterMark = exports.ValidateAndNormalizeHighWaterMark(highWaterMark);

  return { size: size, highWaterMark: highWaterMark };
};

},{"assert":2}],10:[function(require,module,exports){
'use strict';

var assert = require('assert');

var _require = require('./helpers.js');

var IsFiniteNonNegativeNumber = _require.IsFiniteNonNegativeNumber;


exports.DequeueValue = function (queue) {
  assert(queue.length > 0, 'Spec-level failure: should never dequeue from an empty queue.');
  var pair = queue.shift();
  return pair.value;
};

exports.EnqueueValueWithSize = function (queue, value, size) {
  size = Number(size);
  if (!IsFiniteNonNegativeNumber(size)) {
    throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
  }

  queue.push({ value: value, size: size });
};

exports.GetTotalQueueSize = function (queue) {
  var totalSize = 0;

  queue.forEach(function (pair) {
    assert(typeof pair.size === 'number' && !Number.isNaN(pair.size) && pair.size !== +Infinity && pair.size !== -Infinity, 'Spec-level failure: should never find an invalid size in the queue.');
    totalSize += pair.size;
  });

  return totalSize;
};

exports.PeekQueueValue = function (queue) {
  assert(queue.length > 0, 'Spec-level failure: should never peek at an empty queue.');
  var pair = queue[0];
  return pair.value;
};

},{"./helpers.js":9,"assert":2}],11:[function(require,module,exports){
'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var assert = require('assert');

var _require = require('./helpers.js');

var ArrayBufferCopy = _require.ArrayBufferCopy;
var CreateIterResultObject = _require.CreateIterResultObject;
var IsFiniteNonNegativeNumber = _require.IsFiniteNonNegativeNumber;
var InvokeOrNoop = _require.InvokeOrNoop;
var PromiseInvokeOrNoop = _require.PromiseInvokeOrNoop;
var SameRealmTransfer = _require.SameRealmTransfer;
var ValidateAndNormalizeQueuingStrategy = _require.ValidateAndNormalizeQueuingStrategy;
var ValidateAndNormalizeHighWaterMark = _require.ValidateAndNormalizeHighWaterMark;

var _require2 = require('./helpers.js');

var createArrayFromList = _require2.createArrayFromList;
var createDataProperty = _require2.createDataProperty;
var typeIsObject = _require2.typeIsObject;

var _require3 = require('./utils.js');

var rethrowAssertionErrorRejection = _require3.rethrowAssertionErrorRejection;

var _require4 = require('./queue-with-sizes.js');

var DequeueValue = _require4.DequeueValue;
var EnqueueValueWithSize = _require4.EnqueueValueWithSize;
var GetTotalQueueSize = _require4.GetTotalQueueSize;


var InternalCancel = Symbol('[[Cancel]]');
var InternalPull = Symbol('[[Pull]]');

var ReadableStream = function () {
  function ReadableStream() {
    var underlyingSource = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var _ref = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var size = _ref.size;
    var highWaterMark = _ref.highWaterMark;

    _classCallCheck(this, ReadableStream);

    // Exposed to controllers.
    this._state = 'readable';

    this._reader = undefined;
    this._storedError = undefined;

    this._disturbed = false;

    // Initialize to undefined first because the constructor of the controller checks this
    // variable to validate the caller.
    this._readableStreamController = undefined;
    var type = underlyingSource.type;
    var typeString = String(type);
    if (typeString === 'bytes') {
      if (highWaterMark === undefined) {
        highWaterMark = 0;
      }
      this._readableStreamController = new ReadableByteStreamController(this, underlyingSource, highWaterMark);
    } else if (type === undefined) {
      if (highWaterMark === undefined) {
        highWaterMark = 1;
      }
      this._readableStreamController = new ReadableStreamDefaultController(this, underlyingSource, size, highWaterMark);
    } else {
      throw new RangeError('Invalid type is specified');
    }
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

      return ReadableStreamCancel(this, reason);
    }
  }, {
    key: 'getReader',
    value: function getReader() {
      var _ref2 = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var mode = _ref2.mode;

      if (IsReadableStream(this) === false) {
        throw new TypeError('ReadableStream.prototype.getReader can only be used on a ReadableStream');
      }

      if (mode === 'byob') {
        if (IsReadableByteStreamController(this._readableStreamController) === false) {
          throw new TypeError('Cannot get a ReadableStreamBYOBReader for a stream not constructed with a byte source');
        }

        return AcquireReadableStreamBYOBReader(this);
      }

      if (mode === undefined) {
        return AcquireReadableStreamDefaultReader(this);
      }

      throw new RangeError('Invalid mode is specified');
    }
  }, {
    key: 'pipeThrough',
    value: function pipeThrough(_ref3, options) {
      var writable = _ref3.writable;
      var readable = _ref3.readable;

      this.pipeTo(writable, options);
      return readable;
    }
  }, {
    key: 'pipeTo',
    value: function pipeTo(dest) {
      var _ref4 = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var preventClose = _ref4.preventClose;
      var preventAbort = _ref4.preventAbort;
      var preventCancel = _ref4.preventCancel;

      preventClose = Boolean(preventClose);
      preventAbort = Boolean(preventAbort);
      preventCancel = Boolean(preventCancel);

      var source = this;

      var reader = void 0;
      var lastRead = void 0;
      var lastWrite = void 0;
      var closedPurposefully = false;
      var resolvePipeToPromise = void 0;
      var rejectPipeToPromise = void 0;

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
        Promise.all([lastRead, dest.ready]).then(function (_ref5) {
          var _ref6 = _slicedToArray(_ref5, 1);

          var _ref6$ = _ref6[0];
          var value = _ref6$.value;
          var done = _ref6$.done;

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

      var branches = ReadableStreamTee(this, false);
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

exports.ReadableStream = ReadableStream;

// Abstract operations for the ReadableStream.

function AcquireReadableStreamBYOBReader(stream) {
  return new ReadableStreamBYOBReader(stream);
}

function AcquireReadableStreamDefaultReader(stream) {
  return new ReadableStreamDefaultReader(stream);
}

function IsReadableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readableStreamController')) {
    return false;
  }

  return true;
}

function IsReadableStreamDisturbed(stream) {
  assert(IsReadableStream(stream) === true, 'IsReadableStreamDisturbed should only be used on known readable streams');

  return stream._disturbed;
}

exports.IsReadableStreamDisturbed = IsReadableStreamDisturbed;

function IsReadableStreamLocked(stream) {
  assert(IsReadableStream(stream) === true, 'IsReadableStreamLocked should only be used on known readable streams');

  if (stream._reader === undefined) {
    return false;
  }

  return true;
}

function ReadableStreamTee(stream, shouldClone) {
  assert(IsReadableStream(stream) === true);
  assert(typeof shouldClone === 'boolean');

  var reader = AcquireReadableStreamDefaultReader(stream);

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

  var pull = create_ReadableStreamTeePullFunction();
  pull._reader = reader;
  pull._teeState = teeState;
  pull._shouldClone = shouldClone;

  var cancel1 = create_ReadableStreamTeeBranch1CancelFunction();
  cancel1._stream = stream;
  cancel1._teeState = teeState;

  var cancel2 = create_ReadableStreamTeeBranch2CancelFunction();
  cancel2._stream = stream;
  cancel2._teeState = teeState;

  var underlyingSource1 = Object.create(Object.prototype);
  createDataProperty(underlyingSource1, 'pull', pull);
  createDataProperty(underlyingSource1, 'cancel', cancel1);
  var branch1Stream = new ReadableStream(underlyingSource1);

  var underlyingSource2 = Object.create(Object.prototype);
  createDataProperty(underlyingSource2, 'pull', pull);
  createDataProperty(underlyingSource2, 'cancel', cancel2);
  var branch2Stream = new ReadableStream(underlyingSource2);

  pull._branch1 = branch1Stream._readableStreamController;
  pull._branch2 = branch2Stream._readableStreamController;

  reader._closedPromise.catch(function (r) {
    if (teeState.closedOrErrored === true) {
      return undefined;
    }

    ReadableStreamDefaultControllerError(pull._branch1, r);
    ReadableStreamDefaultControllerError(pull._branch2, r);
    teeState.closedOrErrored = true;
  });

  return [branch1Stream, branch2Stream];
}

function create_ReadableStreamTeePullFunction() {
  var f = function f() {
    var reader = f._reader;
    var branch1 = f._branch1;
    var branch2 = f._branch2;
    var teeState = f._teeState;
    var shouldClone = f._shouldClone;


    return ReadableStreamDefaultReaderRead(reader).then(function (result) {
      assert(typeIsObject(result));
      var value = result.value;
      var done = result.done;
      assert(typeof done === "boolean");

      if (done === true && teeState.closedOrErrored === false) {
        if (teeState.canceled1 === false) {
          ReadableStreamDefaultControllerClose(branch1);
        }
        if (teeState.canceled2 === false) {
          ReadableStreamDefaultControllerClose(branch2);
        }
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
        ReadableStreamDefaultControllerEnqueue(branch1, value1);
      }

      if (teeState.canceled2 === false) {
        var value2 = value;
        //        if (shouldClone === true) {
        //          value2 = StructuredClone(value);
        //        }
        ReadableStreamDefaultControllerEnqueue(branch2, value2);
      }
    });
  };
  return f;
}

function create_ReadableStreamTeeBranch1CancelFunction() {
  var f = function f(reason) {
    var stream = f._stream;
    var teeState = f._teeState;


    teeState.canceled1 = true;
    teeState.reason1 = reason;
    if (teeState.canceled2 === true) {
      var compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      var cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

function create_ReadableStreamTeeBranch2CancelFunction() {
  var f = function f(reason) {
    var stream = f._stream;
    var teeState = f._teeState;


    teeState.canceled2 = true;
    teeState.reason2 = reason;
    if (teeState.canceled1 === true) {
      var compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      var cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

// ReadableStream API exposed for controllers.

function ReadableStreamAddReadIntoRequest(stream) {
  assert(IsReadableStreamBYOBReader(stream._reader) === true);
  assert(stream._state === 'readable' || stream._state === 'closed');

  var promise = new Promise(function (resolve, reject) {
    var readIntoRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._reader._readIntoRequests.push(readIntoRequest);
  });

  return promise;
}

function ReadableStreamAddReadRequest(stream) {
  assert(IsReadableStreamDefaultReader(stream._reader) === true);
  assert(stream._state === 'readable');

  var promise = new Promise(function (resolve, reject) {
    var readRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._reader._readRequests.push(readRequest);
  });

  return promise;
}

function ReadableStreamCancel(stream, reason) {
  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(undefined);
  }
  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  ReadableStreamClose(stream);

  var sourceCancelPromise = stream._readableStreamController[InternalCancel](reason);
  return sourceCancelPromise.then(function () {
    return undefined;
  });
}

function ReadableStreamClose(stream) {
  assert(stream._state === 'readable');

  stream._state = 'closed';

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableStreamDefaultReader(reader) === true) {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = reader._readRequests[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var _resolve = _step.value._resolve;

        _resolve(CreateIterResultObject(undefined, true));
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
  }

  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;

  return undefined;
}

function ReadableStreamError(stream, e) {
  assert(IsReadableStream(stream) === true, 'stream must be ReadableStream');
  assert(stream._state === 'readable', 'state must be readable');

  stream._state = 'errored';
  stream._storedError = e;

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableStreamDefaultReader(reader) === true) {
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = reader._readRequests[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var readRequest = _step2.value;

        readRequest._reject(e);
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
  } else {
    assert(IsReadableStreamBYOBReader(reader), 'reader must be ReadableStreamBYOBReader');

    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = reader._readIntoRequests[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var readIntoRequest = _step3.value;

        readIntoRequest._reject(e);
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

    reader._readIntoRequests = [];
  }

  reader._closedPromise_reject(e);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function ReadableStreamFulfillReadIntoRequest(stream, chunk, done) {
  var reader = stream._reader;

  assert(reader._readIntoRequests.length > 0);

  var readIntoRequest = reader._readIntoRequests.shift();
  readIntoRequest._resolve(CreateIterResultObject(chunk, done));
}

function ReadableStreamFulfillReadRequest(stream, chunk, done) {
  var reader = stream._reader;

  assert(reader._readRequests.length > 0);

  var readRequest = reader._readRequests.shift();
  readRequest._resolve(CreateIterResultObject(chunk, done));
}

function ReadableStreamGetNumReadIntoRequests(stream) {
  return stream._reader._readIntoRequests.length;
}

function ReadableStreamGetNumReadRequests(stream) {
  return stream._reader._readRequests.length;
}

function ReadableStreamHasBYOBReader(stream) {
  var reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (IsReadableStreamBYOBReader(reader) === false) {
    return false;
  }

  return true;
}

function ReadableStreamHasDefaultReader(stream) {
  var reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (IsReadableStreamDefaultReader(reader) === false) {
    return false;
  }

  return true;
}

// Readers

var ReadableStreamDefaultReader = function () {
  function ReadableStreamDefaultReader(stream) {
    _classCallCheck(this, ReadableStreamDefaultReader);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamDefaultReader can only be constructed with a ReadableStream instance');
    }
    if (IsReadableStreamLocked(stream) === true) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readRequests = [];
  }

  _createClass(ReadableStreamDefaultReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (IsReadableStreamDefaultReader(this) === false) {
        return Promise.reject(new TypeError('ReadableStreamDefaultReader.prototype.cancel can only be used on a ReadableStreamDefaultReader'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(new TypeError('Cannot cancel a stream using a released reader'));
      }

      return ReadableStreamReaderGenericCancel(this, reason);
    }
  }, {
    key: 'read',
    value: function read() {
      if (IsReadableStreamDefaultReader(this) === false) {
        return Promise.reject(new TypeError('ReadableStreamDefaultReader.prototype.read can only be used on a ReadableStreamDefaultReader'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(new TypeError('Cannot read from a released reader'));
      }

      return ReadableStreamDefaultReaderRead(this);
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (IsReadableStreamDefaultReader(this) === false) {
        throw new TypeError('ReadableStreamDefaultReader.prototype.releaseLock can only be used on a ReadableStreamDefaultReader');
      }

      if (this._ownerReadableStream === undefined) {
        return undefined;
      }

      if (this._readRequests.length > 0) {
        throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
      }

      ReadableStreamReaderGenericRelease(this);
    }
  }, {
    key: 'closed',
    get: function get() {
      if (IsReadableStreamDefaultReader(this) === false) {
        return Promise.reject(new TypeError('ReadableStreamDefaultReader.prototype.closed can only be used on a ReadableStreamDefaultReader'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableStreamDefaultReader;
}();

var ReadableStreamBYOBReader = function () {
  function ReadableStreamBYOBReader(stream) {
    _classCallCheck(this, ReadableStreamBYOBReader);

    if (!IsReadableStream(stream)) {
      throw new TypeError('ReadableStreamBYOBReader can only be constructed with a ReadableStream instance given a ' + 'byte source');
    }
    if (IsReadableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readIntoRequests = [];
  }

  _createClass(ReadableStreamBYOBReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (!IsReadableStreamBYOBReader(this)) {
        return Promise.reject(new TypeError('ReadableStreamBYOBReader.prototype.cancel can only be used on a ReadableStreamBYOBReader'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(new TypeError('Cannot cancel a stream using a released reader'));
      }

      return ReadableStreamReaderGenericCancel(this, reason);
    }
  }, {
    key: 'read',
    value: function read(view) {
      if (!IsReadableStreamBYOBReader(this)) {
        return Promise.reject(new TypeError('ReadableStreamBYOBReader.prototype.read can only be used on a ReadableStreamBYOBReader'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(new TypeError('Cannot read from a released reader'));
      }

      if (!ArrayBuffer.isView(view)) {
        return Promise.reject(new TypeError('view must be an array buffer view'));
      }

      if (view.byteLength === 0) {
        return Promise.reject(new TypeError('view must have non-zero byteLength'));
      }

      return ReadableStreamBYOBReaderRead(this, view);
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (!IsReadableStreamBYOBReader(this)) {
        throw new TypeError('ReadableStreamBYOBReader.prototype.releaseLock can only be used on a ReadableStreamBYOBReader');
      }

      if (this._ownerReadableStream === undefined) {
        return;
      }

      if (this._readIntoRequests.length > 0) {
        throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
      }

      ReadableStreamReaderGenericRelease(this);
    }
  }, {
    key: 'closed',
    get: function get() {
      if (!IsReadableStreamBYOBReader(this)) {
        return Promise.reject(new TypeError('ReadableStreamBYOBReader.prototype.closed can only be used on a ReadableStreamBYOBReader'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableStreamBYOBReader;
}();

// Abstract operations for the readers.

function IsReadableStreamBYOBReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
    return false;
  }

  return true;
}

function IsReadableStreamDefaultReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
    return false;
  }

  return true;
}

function ReadableStreamReaderGenericInitialize(reader, stream) {
  reader._ownerReadableStream = stream;
  stream._reader = reader;

  if (stream._state === 'readable') {
    reader._closedPromise = new Promise(function (resolve, reject) {
      reader._closedPromise_resolve = resolve;
      reader._closedPromise_reject = reject;
    });
  } else {
    if (stream._state === 'closed') {
      reader._closedPromise = Promise.resolve(undefined);
      reader._closedPromise_resolve = undefined;
      reader._closedPromise_reject = undefined;
    } else {
      assert(stream._state === 'errored', 'state must be errored');

      reader._closedPromise = Promise.reject(stream._storedError);
      reader._closedPromise_resolve = undefined;
      reader._closedPromise_reject = undefined;
    }
  }
}

// A client of ReadableStreamDefaultReader and ReadableStreamBYOBReader may use these functions directly to bypass state check.

function ReadableStreamReaderGenericCancel(reader, reason) {
  var stream = reader._ownerReadableStream;
  assert(stream !== undefined);
  return ReadableStreamCancel(stream, reason);
}

function ReadableStreamReaderGenericRelease(reader) {
  assert(reader._ownerReadableStream !== undefined);
  assert(reader._ownerReadableStream._reader === reader);

  if (reader._ownerReadableStream._state === 'readable') {
    reader._closedPromise_reject(new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
  } else {
    reader._closedPromise = Promise.reject(new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
  }

  reader._ownerReadableStream._reader = undefined;
  reader._ownerReadableStream = undefined;
}

function ReadableStreamBYOBReaderRead(reader, view) {
  var stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  // Controllers must implement this.
  return ReadableByteStreamControllerPullInto(stream._readableStreamController, view);
}

function ReadableStreamDefaultReaderRead(reader) {
  var stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(CreateIterResultObject(undefined, true));
  }

  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  assert(stream._state === 'readable');

  return stream._readableStreamController[InternalPull]();
}

// Controllers

var ReadableStreamDefaultController = function () {
  function ReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark) {
    _classCallCheck(this, ReadableStreamDefaultController);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamDefaultController can only be constructed with a ReadableStream instance');
    }

    if (stream._readableStreamController !== undefined) {
      throw new TypeError('ReadableStreamDefaultController instances can only be created by the ReadableStream constructor');
    }

    this._controlledReadableStream = stream;

    this._underlyingSource = underlyingSource;

    this._queue = [];
    this._started = false;
    this._closeRequested = false;
    this._pullAgain = false;
    this._pulling = false;

    var normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    var controller = this;

    var startResult = InvokeOrNoop(underlyingSource, 'start', [this]);
    Promise.resolve(startResult).then(function () {
      controller._started = true;
      ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    }, function (r) {
      if (stream._state === 'readable') {
        ReadableStreamDefaultControllerError(controller, r);
      }
    }).catch(rethrowAssertionErrorRejection);
  }

  _createClass(ReadableStreamDefaultController, [{
    key: 'close',
    value: function close() {
      if (IsReadableStreamDefaultController(this) === false) {
        throw new TypeError('ReadableStreamDefaultController.prototype.close can only be used on a ReadableStreamDefaultController');
      }

      if (this._closeRequested === true) {
        throw new TypeError('The stream has already been closed; do not close it again!');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be closed');
      }

      ReadableStreamDefaultControllerClose(this);
    }
  }, {
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (IsReadableStreamDefaultController(this) === false) {
        throw new TypeError('ReadableStreamDefaultController.prototype.enqueue can only be used on a ReadableStreamDefaultController');
      }

      if (this._closeRequested === true) {
        throw new TypeError('stream is closed or draining');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be enqueued to');
      }

      return ReadableStreamDefaultControllerEnqueue(this, chunk);
    }
  }, {
    key: 'error',
    value: function error(e) {
      if (IsReadableStreamDefaultController(this) === false) {
        throw new TypeError('ReadableStreamDefaultController.prototype.error can only be used on a ReadableStreamDefaultController');
      }

      var stream = this._controlledReadableStream;
      if (stream._state !== 'readable') {
        throw new TypeError('The stream is ' + stream._state + ' and so cannot be errored');
      }

      ReadableStreamDefaultControllerError(this, e);
    }
  }, {
    key: InternalCancel,
    value: function value(reason) {
      this._queue = [];

      return PromiseInvokeOrNoop(this._underlyingSource, 'cancel', [reason]);
    }
  }, {
    key: InternalPull,
    value: function value() {
      var stream = this._controlledReadableStream;

      if (this._queue.length > 0) {
        var chunk = DequeueValue(this._queue);

        if (this._closeRequested === true && this._queue.length === 0) {
          ReadableStreamClose(stream);
        } else {
          ReadableStreamDefaultControllerCallPullIfNeeded(this);
        }

        return Promise.resolve(CreateIterResultObject(chunk, false));
      }

      var pendingPromise = ReadableStreamAddReadRequest(stream);
      ReadableStreamDefaultControllerCallPullIfNeeded(this);
      return pendingPromise;
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsReadableStreamDefaultController(this) === false) {
        throw new TypeError('ReadableStreamDefaultController.prototype.desiredSize can only be used on a ReadableStreamDefaultController');
      }

      return ReadableStreamDefaultControllerGetDesiredSize(this);
    }
  }]);

  return ReadableStreamDefaultController;
}();

// Abstract operations for the ReadableStreamDefaultController.

function IsReadableStreamDefaultController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSource')) {
    return false;
  }

  return true;
}

function ReadableStreamDefaultControllerCallPullIfNeeded(controller) {
  var shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return undefined;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return undefined;
  }

  controller._pulling = true;

  var pullPromise = PromiseInvokeOrNoop(controller._underlyingSource, 'pull', [controller]);
  pullPromise.then(function () {
    controller._pulling = false;

    if (controller._pullAgain === true) {
      controller._pullAgain = false;
      return ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    }
  }, function (e) {
    if (controller._controlledReadableStream._state === 'readable') {
      return ReadableStreamDefaultControllerError(controller, e);
    }
  }).catch(rethrowAssertionErrorRejection);

  return undefined;
}

function ReadableStreamDefaultControllerShouldCallPull(controller) {
  var stream = controller._controlledReadableStream;

  if (stream._state === 'closed' || stream._state === 'errored') {
    return false;
  }

  if (controller._closeRequested === true) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (IsReadableStreamLocked(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  var desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
  if (desiredSize > 0) {
    return true;
  }

  return false;
}

// A client of ReadableStreamDefaultController may use these functions directly to bypass state check.

function ReadableStreamDefaultControllerClose(controller) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  controller._closeRequested = true;

  if (controller._queue.length === 0) {
    ReadableStreamClose(stream);
  }
}

function ReadableStreamDefaultControllerEnqueue(controller, chunk) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  if (IsReadableStreamLocked(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    ReadableStreamFulfillReadRequest(stream, chunk, false);
  } else {
    var chunkSize = 1;

    if (controller._strategySize !== undefined) {
      try {
        chunkSize = controller._strategySize(chunk);
      } catch (chunkSizeE) {
        if (stream._state === 'readable') {
          ReadableStreamDefaultControllerError(controller, chunkSizeE);
        }
        throw chunkSizeE;
      }
    }

    try {
      EnqueueValueWithSize(controller._queue, chunk, chunkSize);
    } catch (enqueueE) {
      if (stream._state === 'readable') {
        ReadableStreamDefaultControllerError(controller, enqueueE);
      }
      throw enqueueE;
    }
  }

  ReadableStreamDefaultControllerCallPullIfNeeded(controller);

  return undefined;
}

function ReadableStreamDefaultControllerError(controller, e) {
  var stream = controller._controlledReadableStream;

  assert(stream._state === 'readable');

  controller._queue = [];

  ReadableStreamError(stream, e);
}

function ReadableStreamDefaultControllerGetDesiredSize(controller) {
  var queueSize = GetTotalQueueSize(controller._queue);
  return controller._strategyHWM - queueSize;
}

var ReadableStreamBYOBRequest = function () {
  function ReadableStreamBYOBRequest(controller, view) {
    _classCallCheck(this, ReadableStreamBYOBRequest);

    this._associatedReadableByteStreamController = controller;
    this._view = view;
  }

  _createClass(ReadableStreamBYOBRequest, [{
    key: 'respond',
    value: function respond(bytesWritten) {
      if (IsReadableStreamBYOBRequest(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.respond can only be used on a ReadableByteStreamController');
      }

      if (this._associatedReadableByteStreamController === undefined) {
        throw new TypeError('This BYOB request has been invalidated');
      }

      ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
    }
  }, {
    key: 'respondWithNewView',
    value: function respondWithNewView(view) {
      if (IsReadableStreamBYOBRequest(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.respond can only be used on a ReadableByteStreamController');
      }

      if (this._associatedReadableByteStreamController === undefined) {
        throw new TypeError('This BYOB request has been invalidated');
      }

      if (!ArrayBuffer.isView(view)) {
        throw new TypeError('You can only respond with array buffer views');
      }

      ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
    }
  }, {
    key: 'view',
    get: function get() {
      return this._view;
    }
  }]);

  return ReadableStreamBYOBRequest;
}();

var ReadableByteStreamController = function () {
  function ReadableByteStreamController(stream, underlyingByteSource, highWaterMark) {
    _classCallCheck(this, ReadableByteStreamController);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableByteStreamController can only be constructed with a ReadableStream instance given ' + 'a byte source');
    }

    if (stream._readableStreamController !== undefined) {
      throw new TypeError('ReadableByteStreamController instances can only be created by the ReadableStream constructor given a byte ' + 'source');
    }

    this._controlledReadableStream = stream;

    this._underlyingByteSource = underlyingByteSource;

    this._pullAgain = false;
    this._pulling = false;

    ReadableByteStreamControllerClearPendingPullIntos(this);

    this._queue = [];
    this._totalQueuedBytes = 0;

    this._closeRequested = false;

    this._started = false;

    this._strategyHWM = ValidateAndNormalizeHighWaterMark(highWaterMark);

    var autoAllocateChunkSize = underlyingByteSource['autoAllocateChunkSize'];
    if (autoAllocateChunkSize !== undefined) {
      if (Number.isInteger(autoAllocateChunkSize) === false || autoAllocateChunkSize < 0) {
        throw new RangeError("autoAllocateChunkSize must be a non negative integer");
      }
    }
    this._autoAllocateChunkSize = autoAllocateChunkSize;

    this._pendingPullIntos = [];

    var controller = this;

    var startResult = InvokeOrNoop(underlyingByteSource, 'start', [this]);
    Promise.resolve(startResult).then(function () {
      controller._started = true;

      assert(controller._pulling === false);
      assert(controller._pullAgain === false);

      ReadableByteStreamControllerCallPullIfNeeded(controller);
    }, function (r) {
      if (stream._state === 'readable') {
        ReadableByteStreamControllerError(controller, r);
      }
    }).catch(rethrowAssertionErrorRejection);
  }

  _createClass(ReadableByteStreamController, [{
    key: 'close',
    value: function close() {
      if (IsReadableByteStreamController(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.close can only be used on a ReadableByteStreamController');
      }

      if (this._closeRequested === true) {
        throw new TypeError('The stream has already been closed; do not close it again!');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be closed');
      }

      ReadableByteStreamControllerClose(this);
    }
  }, {
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (IsReadableByteStreamController(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.enqueue can only be used on a ReadableByteStreamController');
      }

      if (this._closeRequested === true) {
        throw new TypeError('stream is closed or draining');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be enqueued to');
      }

      if (!ArrayBuffer.isView(chunk)) {
        throw new TypeError('You can only enqueue array buffer views when using a ReadableByteStreamController');
      }

      ReadableByteStreamControllerEnqueue(this, chunk);
    }
  }, {
    key: 'error',
    value: function error(e) {
      if (IsReadableByteStreamController(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.error can only be used on a ReadableByteStreamController');
      }

      var stream = this._controlledReadableStream;
      if (stream._state !== 'readable') {
        throw new TypeError('The stream is ' + stream._state + ' and so cannot be errored');
      }

      ReadableByteStreamControllerError(this, e);
    }
  }, {
    key: InternalCancel,
    value: function value(reason) {
      if (this._pendingPullIntos.length > 0) {
        var firstDescriptor = this._pendingPullIntos[0];
        firstDescriptor.bytesFilled = 0;
      }

      this._queue = [];
      this._totalQueuedBytes = 0;

      return PromiseInvokeOrNoop(this._underlyingByteSource, 'cancel', [reason]);
    }
  }, {
    key: InternalPull,
    value: function value() {
      var stream = this._controlledReadableStream;

      if (ReadableStreamGetNumReadRequests(stream) === 0) {
        if (this._totalQueuedBytes > 0) {
          var entry = this._queue.shift();
          this._totalQueuedBytes -= entry.byteLength;

          ReadableByteStreamControllerHandleQueueDrain(this);

          var view = void 0;
          try {
            view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
          } catch (viewE) {
            return Promise.reject(viewE);
          }

          return Promise.resolve(CreateIterResultObject(view, false));
        }

        var autoAllocateChunkSize = this._autoAllocateChunkSize;
        if (autoAllocateChunkSize !== undefined) {
          var buffer = void 0;
          try {
            buffer = new ArrayBuffer(autoAllocateChunkSize);
          } catch (bufferE) {
            return Promise.reject(bufferE);
          }

          var pullIntoDescriptor = {
            buffer: buffer,
            byteOffset: 0,
            byteLength: autoAllocateChunkSize,
            bytesFilled: 0,
            elementSize: 1,
            ctor: Uint8Array,
            readerType: 'default'
          };

          this._pendingPullIntos.push(pullIntoDescriptor);
        }
      } else {
        assert(this._autoAllocateChunkSize === undefined);
      }

      var promise = ReadableStreamAddReadRequest(stream);

      ReadableByteStreamControllerCallPullIfNeeded(this);

      return promise;
    }
  }, {
    key: 'byobRequest',
    get: function get() {
      if (IsReadableByteStreamController(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.byobRequest can only be used on a ReadableByteStreamController');
      }

      if (this._byobRequest === undefined && this._pendingPullIntos.length > 0) {
        var firstDescriptor = this._pendingPullIntos[0];
        var view = new Uint8Array(firstDescriptor.buffer, firstDescriptor.byteOffset + firstDescriptor.bytesFilled, firstDescriptor.byteLength - firstDescriptor.bytesFilled);

        this._byobRequest = new ReadableStreamBYOBRequest(this, view);
      }

      return this._byobRequest;
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsReadableByteStreamController(this) === false) {
        throw new TypeError('ReadableByteStreamController.prototype.desiredSize can only be used on a ReadableByteStreamController');
      }

      return ReadableByteStreamControllerGetDesiredSize(this);
    }
  }]);

  return ReadableByteStreamController;
}();

// Abstract operations for the ReadableByteStreamController.

function IsReadableByteStreamController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingByteSource')) {
    return false;
  }

  return true;
}

function IsReadableStreamBYOBRequest(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_associatedReadableByteStreamController')) {
    return false;
  }

  return true;
}

function ReadableByteStreamControllerCallPullIfNeeded(controller) {
  var shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return undefined;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return undefined;
  }

  controller._pullAgain = false;

  controller._pulling = true;

  // TODO: Test controller argument
  var pullPromise = PromiseInvokeOrNoop(controller._underlyingByteSource, 'pull', [controller]);
  pullPromise.then(function () {
    controller._pulling = false;

    if (controller._pullAgain === true) {
      controller._pullAgain = false;
      ReadableByteStreamControllerCallPullIfNeeded(controller);
    }
  }, function (e) {
    if (controller._controlledReadableStream._state === 'readable') {
      ReadableByteStreamControllerError(controller, e);
    }
  }).catch(rethrowAssertionErrorRejection);

  return undefined;
}

function ReadableByteStreamControllerClearPendingPullIntos(controller) {
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  controller._pendingPullIntos = [];
}

function ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor) {
  assert(stream._state !== 'errored', 'state must not be errored');

  var done = false;
  if (stream._state === 'closed') {
    assert(pullIntoDescriptor.bytesFilled === 0);
    done = true;
  }

  var filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);
  if (pullIntoDescriptor.readerType === 'default') {
    ReadableStreamFulfillReadRequest(stream, filledView, done);
  } else {
    assert(pullIntoDescriptor.readerType === 'byob');
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
}

function ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor) {
  var bytesFilled = pullIntoDescriptor.bytesFilled;
  var elementSize = pullIntoDescriptor.elementSize;

  assert(bytesFilled <= pullIntoDescriptor.byteLength);
  assert(bytesFilled % elementSize === 0);

  return new pullIntoDescriptor.ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize);
}

function ReadableByteStreamControllerEnqueueChunkToQueue(controller, buffer, byteOffset, byteLength) {
  controller._queue.push({ buffer: buffer, byteOffset: byteOffset, byteLength: byteLength });
  controller._totalQueuedBytes += byteLength;
}

function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) {
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
    ArrayBufferCopy(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);

    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller._totalQueuedBytes -= bytesToCopy;

    ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesToCopy, pullIntoDescriptor);

    totalBytesToCopyRemaining -= bytesToCopy;
  }

  if (ready === false) {
    assert(controller._totalQueuedBytes === 0, 'queue must be empty');
    assert(pullIntoDescriptor.bytesFilled > 0);
    assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize);
  }

  return ready;
}

function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, size, pullIntoDescriptor) {
  assert(controller._pendingPullIntos.length === 0 || controller._pendingPullIntos[0] === pullIntoDescriptor);

  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  pullIntoDescriptor.bytesFilled += size;
}

function ReadableByteStreamControllerHandleQueueDrain(controller) {
  assert(controller._controlledReadableStream._state === 'readable');

  if (controller._totalQueuedBytes === 0 && controller._closeRequested === true) {
    ReadableStreamClose(controller._controlledReadableStream);
  } else {
    ReadableByteStreamControllerCallPullIfNeeded(controller);
  }
}

function ReadableByteStreamControllerInvalidateBYOBRequest(controller) {
  if (controller._byobRequest === undefined) {
    return;
  }

  controller._byobRequest._associatedReadableByteStreamController = undefined;
  controller._byobRequest._view = undefined;
  controller._byobRequest = undefined;
}

function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller) {
  assert(controller._closeRequested === false);

  while (controller._pendingPullIntos.length > 0) {
    if (controller._totalQueuedBytes === 0) {
      return;
    }

    var pullIntoDescriptor = controller._pendingPullIntos[0];

    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      ReadableByteStreamControllerShiftPendingPullInto(controller);

      ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableStream, pullIntoDescriptor);
    }
  }
}

function ReadableByteStreamControllerPullInto(controller, view) {
  var stream = controller._controlledReadableStream;

  var elementSize = 1;
  if (view.constructor !== DataView) {
    elementSize = view.constructor.BYTES_PER_ELEMENT;
  }

  var ctor = view.constructor;

  var pullIntoDescriptor = {
    buffer: view.buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
    bytesFilled: 0,
    elementSize: elementSize,
    ctor: ctor,
    readerType: 'byob'
  };

  if (controller._pendingPullIntos.length > 0) {
    pullIntoDescriptor.buffer = SameRealmTransfer(pullIntoDescriptor.buffer);;
    controller._pendingPullIntos.push(pullIntoDescriptor);

    // No ReadableByteStreamControllerCallPullIfNeeded() call since:
    // - No change happens on desiredSize
    // - The source has already been notified of that there's at least 1 pending read(view)

    return ReadableStreamAddReadIntoRequest(stream);
  }

  if (stream._state === 'closed') {
    var emptyView = new view.constructor(view.buffer, view.byteOffset, 0);
    return Promise.resolve(CreateIterResultObject(emptyView, true));
  }

  if (controller._totalQueuedBytes > 0) {
    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      var filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);

      ReadableByteStreamControllerHandleQueueDrain(controller);

      return Promise.resolve(CreateIterResultObject(filledView, false));
    }

    if (controller._closeRequested === true) {
      var e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      return Promise.reject(e);
    }
  }

  pullIntoDescriptor.buffer = SameRealmTransfer(pullIntoDescriptor.buffer);
  controller._pendingPullIntos.push(pullIntoDescriptor);

  var promise = ReadableStreamAddReadIntoRequest(stream);

  ReadableByteStreamControllerCallPullIfNeeded(controller);

  return promise;
}

function ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor) {
  firstDescriptor.buffer = SameRealmTransfer(firstDescriptor.buffer);

  assert(firstDescriptor.bytesFilled === 0, 'bytesFilled must be 0');

  var stream = controller._controlledReadableStream;

  while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
    var pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(controller);

    ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
  }
}

function ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, pullIntoDescriptor) {
  if (pullIntoDescriptor.bytesFilled + bytesWritten > pullIntoDescriptor.byteLength) {
    throw new RangeError('bytesWritten out of range');
  }

  ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);

  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    // TODO: Figure out whether we should detach the buffer or not here.
    return;
  }

  ReadableByteStreamControllerShiftPendingPullInto(controller);

  var remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    var end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    var remainder = pullIntoDescriptor.buffer.slice(end - remainderSize, end);
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, remainder, 0, remainder.byteLength);
  }

  pullIntoDescriptor.buffer = SameRealmTransfer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.bytesFilled -= remainderSize;
  ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableStream, pullIntoDescriptor);

  ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
}

function ReadableByteStreamControllerRespondInternal(controller, bytesWritten) {
  var firstDescriptor = controller._pendingPullIntos[0];

  var stream = controller._controlledReadableStream;

  if (stream._state === 'closed') {
    if (bytesWritten !== 0) {
      throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
    }

    ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
  } else {
    assert(stream._state === 'readable');

    ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
  }
}

function ReadableByteStreamControllerShiftPendingPullInto(controller) {
  var descriptor = controller._pendingPullIntos.shift();
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  return descriptor;
}

function ReadableByteStreamControllerShouldCallPull(controller) {
  var stream = controller._controlledReadableStream;

  if (stream._state !== 'readable') {
    return false;
  }

  if (controller._closeRequested === true) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (ReadableStreamHasDefaultReader(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  if (ReadableStreamHasBYOBReader(stream) && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
    return true;
  }

  if (ReadableByteStreamControllerGetDesiredSize(controller) > 0) {
    return true;
  }

  return false;
}

// A client of ReadableByteStreamController may use these functions directly to bypass state check.

function ReadableByteStreamControllerClose(controller) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  if (controller._totalQueuedBytes > 0) {
    controller._closeRequested = true;

    return;
  }

  if (controller._pendingPullIntos.length > 0) {
    var firstPendingPullInto = controller._pendingPullIntos[0];
    if (firstPendingPullInto.bytesFilled > 0) {
      var e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      throw e;
    }
  }

  ReadableStreamClose(stream);
}

function ReadableByteStreamControllerEnqueue(controller, chunk) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  var buffer = chunk.buffer;
  var byteOffset = chunk.byteOffset;
  var byteLength = chunk.byteLength;
  var transferredBuffer = SameRealmTransfer(buffer);

  if (ReadableStreamHasDefaultReader(stream) === true) {
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    } else {
      assert(controller._queue.length === 0);

      var transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
      ReadableStreamFulfillReadRequest(stream, transferredView, false);
    }
  } else if (ReadableStreamHasBYOBReader(stream) === true) {
    // TODO: Ideally in this branch detaching should happen only if the buffer is not consumed fully.
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
  } else {
    assert(IsReadableStreamLocked(stream) === false, 'stream must not be locked');
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
  }
}

function ReadableByteStreamControllerError(controller, e) {
  var stream = controller._controlledReadableStream;

  assert(stream._state === 'readable');

  ReadableByteStreamControllerClearPendingPullIntos(controller);

  controller._queue = [];

  ReadableStreamError(stream, e);
}

function ReadableByteStreamControllerGetDesiredSize(controller) {
  return controller._strategyHWM - controller._totalQueuedBytes;
}

function ReadableByteStreamControllerRespond(controller, bytesWritten) {
  bytesWritten = Number(bytesWritten);
  if (IsFiniteNonNegativeNumber(bytesWritten) === false) {
    throw new RangeError('bytesWritten must be a finite');
  }

  assert(controller._pendingPullIntos.length > 0);

  ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
}

function ReadableByteStreamControllerRespondWithNewView(controller, view) {
  assert(controller._pendingPullIntos.length > 0);

  var firstDescriptor = controller._pendingPullIntos[0];

  if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
    throw new RangeError('The region specified by view does not match byobRequest');
  }
  if (firstDescriptor.byteLength !== view.byteLength) {
    throw new RangeError('The buffer of view has different capacity than byobRequest');
  }

  firstDescriptor.buffer = view.buffer;

  ReadableByteStreamControllerRespondInternal(controller, view.byteLength);
}

},{"./helpers.js":9,"./queue-with-sizes.js":10,"./utils.js":13,"assert":2}],12:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('./readable-stream.js');

var ReadableStream = _require.ReadableStream;

var _require2 = require('./writable-stream.js');

var WritableStream = _require2.WritableStream;


module.exports = function TransformStream(transformer) {
  _classCallCheck(this, TransformStream);

  if (transformer.flush === undefined) {
    transformer.flush = function (enqueue, close) {
      return close();
    };
  }

  if (typeof transformer.transform !== 'function') {
    throw new TypeError('transform must be a function');
  }

  var writeChunk = void 0,
      writeDone = void 0,
      errorWritable = void 0;
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

  var enqueueInReadable = void 0,
      closeReadable = void 0,
      errorReadable = void 0;
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

},{"./readable-stream.js":11,"./writable-stream.js":14}],13:[function(require,module,exports){
'use strict';

var assert = require('assert');

exports.rethrowAssertionErrorRejection = function (e) {
  // Used throughout the reference implementation, as `.catch(rethrowAssertionErrorRejection)`, to ensure any errors
  // get shown. There are places in the spec where we do promise transformations and purposefully ignore or don't
  // expect any errors, but assertion errors are always problematic.
  if (e && e.constructor === assert.AssertionError) {
    setTimeout(function () {
      throw e;
    }, 0);
  }
};

},{"assert":2}],14:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var assert = require('assert');

var _require = require('./helpers.js');

var InvokeOrNoop = _require.InvokeOrNoop;
var PromiseInvokeOrNoop = _require.PromiseInvokeOrNoop;
var PromiseInvokeOrFallbackOrNoop = _require.PromiseInvokeOrFallbackOrNoop;
var ValidateAndNormalizeQueuingStrategy = _require.ValidateAndNormalizeQueuingStrategy;
var typeIsObject = _require.typeIsObject;

var _require2 = require('./utils.js');

var rethrowAssertionErrorRejection = _require2.rethrowAssertionErrorRejection;

var _require3 = require('./queue-with-sizes.js');

var DequeueValue = _require3.DequeueValue;
var EnqueueValueWithSize = _require3.EnqueueValueWithSize;
var GetTotalQueueSize = _require3.GetTotalQueueSize;
var PeekQueueValue = _require3.PeekQueueValue;

var CountQueuingStrategy = require('./count-queuing-strategy.js');

var WritableStream = function () {
  function WritableStream() {
    var _this = this;

    var underlyingSink = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var _ref = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var size = _ref.size;
    var _ref$highWaterMark = _ref.highWaterMark;
    var highWaterMark = _ref$highWaterMark === undefined ? 0 : _ref$highWaterMark;

    _classCallCheck(this, WritableStream);

    this._underlyingSink = underlyingSink;

    this._closedPromise = new Promise(function (resolve, reject) {
      _this._closedPromise_resolve = resolve;
      _this._closedPromise_reject = reject;
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
      _this._started = true;
      _this._startedPromise = undefined;
    });
    this._startedPromise.catch(function (r) {
      return ErrorWritableStream(_this, r);
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

      assert(this._state === 'waiting' || this._state === 'writable');

      var chunkSize = 1;

      if (this._strategySize !== undefined) {
        try {
          chunkSize = this._strategySize(chunk);
        } catch (chunkSizeE) {
          ErrorWritableStream(this, chunkSizeE);
          return Promise.reject(chunkSizeE);
        }
      }

      var resolver = void 0,
          rejecter = void 0;
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

exports.WritableStream = WritableStream;

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
  assert(stream._state === 'closing', 'stream must be in closing state while calling CloseWritableStream');

  var sinkClosePromise = PromiseInvokeOrNoop(stream._underlyingSink, 'close');
  sinkClosePromise.then(function () {
    if (stream._state === 'errored') {
      return;
    }

    assert(stream._state === 'closing');

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

exports.IsWritableStream = IsWritableStream;

function SyncWritableStreamStateWithQueue(stream) {
  if (stream._state === 'closing') {
    return undefined;
  }

  assert(stream._state === 'writable' || stream._state === 'waiting', 'stream must be in a writable or waiting state while calling SyncWritableStreamStateWithQueue');

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
    assert(stream._state === 'closing', 'can\'t process final write record unless already closing');
    DequeueValue(stream._queue);
    assert(stream._queue.length === 0, 'queue must be empty once the final write record is dequeued');
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

},{"./count-queuing-strategy.js":8,"./helpers.js":9,"./queue-with-sizes.js":10,"./utils.js":13,"assert":2}]},{},[1])(1)
});