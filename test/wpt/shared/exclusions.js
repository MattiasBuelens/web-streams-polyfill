const excludedTestsBase = [
  // We cannot polyfill TransferArrayBuffer yet, so disable tests for detached array buffers
  // See https://github.com/MattiasBuelens/web-streams-polyfill/issues/3
  'readable-byte-streams/bad-buffers-and-views.any.html',
  'readable-byte-streams/enqueue-with-detached-buffer.window.html',
  'readable-byte-streams/non-transferable-buffers.any.html',
  // Disable tests for different size functions per realm, since they need a working <iframe>
  'queuing-strategies-size-function-per-global.window.html',
  // We don't implement transferable streams yet
  'transferable/**',
  // We use the public API to implement pipeTo() and tee(),
  // so patching various globals *will* affect the polyfill.
  'readable-streams/patched-global.any.html',
  'piping/then-interception.any.html',
  'transform-streams/patched-global.any.html'
];

const excludedTestsNonES2018 = [
  // Skip tests that use async generators or for-await-of
  'readable-streams/async-iterator.any.html',
  'readable-streams/patched-global.any.html'
];

const skippedTests = {
  'piping/abort.any.html': [
    // This test cheats: pipeTo() releases the reader's lock while there's still a pending read().
    // The polyfill cannot do this, because it uses the reader.releaseLock() public API.
    'abort should do nothing after the writable is errored'
  ]
};

const ignoredFailuresBase = {
  // We cannot transfer byobRequest.view.buffer after respond() or enqueue()
  'readable-byte-streams/general.any.html': [
    'ReadableStream with byte source: read(view) with Uint32Array, then fill it by multiple respond() calls',
    'ReadableStream with byte source: read(view) with Uint32Array, then fill it by multiple enqueue() calls'
  ],
  // Same thing: the enqueued chunk will have the same buffer as branch1's chunk
  'readable-byte-streams/tee.any.html': [
    'ReadableStream teeing with byte source: chunks should be cloned for each branch'
  ],
  // Our async iterator won't extend from the built-in %AsyncIteratorPrototype%
  'readable-streams/async-iterator.any.html': [
    'Async iterator instances should have the correct list of properties'
  ]
};

const ignoredFailuresMinified = {
  'idlharness.any.html': [
    // Terser turns `(a = undefined) => {}` into `(a) => {}`, changing the function's length property
    // Therefore we cannot correctly implement methods with optional arguments
    /interface: operation (abort|cancel|enqueue|error|getReader|write)/,
    // Same thing for ReadableStream.values(), which is tested as part of the async iterable declaration
    'ReadableStream interface: async iterable<any>'
  ]
};

const ignoredFailuresES5 = mergeIgnoredFailures(ignoredFailuresBase, {
  'idlharness.any.html': [
    // ES5 build does not set correct length on constructors with optional arguments
    'ReadableStream interface object length',
    'WritableStream interface object length',
    'TransformStream interface object length',
    // ES5 build does not set correct length on methods with optional arguments
    /interface: operation \w+\(.*optional.*\)/,
    'ReadableStream interface: async iterable<any>',
    // ES5 build does not set correct function name on getters and setters
    /interface: attribute/,
    // ES5 build has { writable: true } on prototype objects
    /interface: existence and properties of interface prototype object/
  ],
  'queuing-strategies.any.html': [
    // ES5 build turns arrow functions into regular functions, which cannot be marked as non-constructable
    'ByteLengthQueuingStrategy: size should not have a prototype property',
    'CountQueuingStrategy: size should not have a prototype property',
    'ByteLengthQueuingStrategy: size should not be a constructor',
    'CountQueuingStrategy: size should not be a constructor'
  ]
});

function mergeIgnoredFailures(left, right) {
  const result = { ...left };
  for (const key of Object.keys(right)) {
    result[key] = [...(result[key] || []), ...right[key]];
  }
  return result;
}

module.exports = {
  excludedTestsBase,
  excludedTestsNonES2018,
  skippedTests,
  ignoredFailuresBase,
  ignoredFailuresMinified,
  ignoredFailuresES5,
  mergeIgnoredFailures
};
