import path from 'node:path';
import { ExactName } from './filtering-reporter.mjs';

export const excludedTestsBase = [
  // We cannot detect non-transferability, and Node's WebAssembly.Memory is also not marked as such.
  'readable-byte-streams/non-transferable-buffers.any.html',
  // Disable tests for different size functions per realm, since they need a working <iframe>
  'queuing-strategies-size-function-per-global.window.html',
  // We don't implement transferable streams yet
  'transferable/**',
  // The crash tests require creating and terminating workers and iframes.
  'piping/crashtests/**',
  'readable-streams/cross-realm-crash.window.html',
  'readable-byte-streams/crashtests/from-cross-realm*.html',
  'readable-streams/crashtests/**',
  // This test is blocked on an unresolved spec issue: https://github.com/whatwg/streams/issues/1243
  'piping/general-addition.any.html',
  // We don't support ShadowRealms.
  'idlharness-shadowrealm.window.html',
  // We don't patch globals inside other <iframe>s.
  'readable-streams/global.html',
  'readable-streams/tee-detached-context-crash.html',
  'transform-streams/invalid-realm.tentative.window.html',
  // We don't support MessagePort or VideoFrame.
  'readable-streams/owning-type-message-port*.any.html',
  'readable-streams/owning-type-video-frame*.any.html',
  'readable-streams/owning-type*.any.html' // FIXME: reenable this test once owning type PR lands.
];

export const excludedTestsNonES2018 = [
  // Skip tests that use async generators or for-await-of
  'readable-streams/async-iterator.any.html',
  'readable-streams/patched-global.any.html'
];

export const ignoredFailuresBase = {
  // We cannot distinguish between a zero-length ArrayBuffer and a detached ArrayBuffer,
  // so we incorrectly throw a TypeError instead of a RangeError
  'readable-byte-streams/bad-buffers-and-views.any.html': [
    'ReadableStream with byte source: respondWithNewView() throws if the supplied view\'s buffer is zero-length ' +
    '(in the closed state)'
  ],
  // Our async iterator won't extend from the built-in %AsyncIteratorPrototype%
  'readable-streams/async-iterator.any.html': [
    'Async iterator instances should have the correct list of properties'
  ]
};

export const ignoredFailuresMinified = {
  'idlharness.any.html': [
    // Terser turns `(a = undefined) => {}` into `(a) => {}`, changing the function's length property
    // Therefore we cannot correctly implement methods with optional arguments
    /interface: operation (abort|cancel|enqueue|error|getReader|read|write)/,
    // Same thing for ReadableStream.values(), which is tested as part of the async iterable declaration
    'ReadableStream interface: async iterable<any>'
  ]
};

export const ignoredFailuresES5 = mergeIgnoredFailures(ignoredFailuresBase, {
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

/**
 * The directory with our own modified copies of WPT tests, laid out like the `streams/` directory.
 * Their suites are reported as `modified/<path>`.
 */
export const modifiedTestsPath = path.resolve(import.meta.dirname, '../modified');
export const modifiedSuitePrefix = 'modified/';

/**
 * Tests that cannot pass when a feature module is installed on top of a native implementation.
 * In the patched modes, these are ignored and never recorded in the expectations.
 * Each one has a relaxed copy in the modified tests, which runs in every mode instead.
 */
export const replacedTestsPatched = {
  // See modified/readable-byte-streams/read-min.any.js
  'readable-byte-streams/read-min.any.html': [
    new ExactName('ReadableStream with byte source: cancel() with partially filled pending read({ min }) request'),
    new ExactName('ReadableStream with byte source: read({ min }) with 2-element Uint16Array, '
      + 'then 3 byte enqueue(), then close() must fail')
  ]
};

/**
 * Returns whether the given test is one of the {@link replacedTestsPatched}.
 * These may pass in the patched runs when the native implementation already has the feature,
 * so they're not reported as expected failures that didn't fail.
 */
export function isReplacedTest(suite, test) {
  return (replacedTestsPatched[suite] ?? []).some(replaced => String(replaced) === test);
}

/**
 * Removes the {@link replacedTestsPatched} from the given failures.
 */
export function withoutReplacedTests(failures) {
  const result = {};
  for (const suite of Object.keys(failures)) {
    const replaced = new Set((replacedTestsPatched[suite] ?? []).map(String));
    const remaining = failures[suite].filter(test => !replaced.has(test));
    if (remaining.length > 0) {
      result[suite] = remaining;
    }
  }
  return result;
}

export function mergeIgnoredFailures(left, right) {
  const result = { ...left };
  for (const key of Object.keys(right)) {
    result[key] = [...(result[key] || []), ...right[key]];
  }
  return result;
}
