// This runs the web platform tests against the reference implementation, in Node.js using jsdom, for easier rapid
// development of the reference implementation and the web platform tests.
/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const micromatch = require('micromatch');
const wptRunner = require('wpt-runner');
const consoleReporter = require('wpt-runner/lib/console-reporter.js');
const { FilteringReporter } = require('./wpt-util/filtering-reporter.js');

const readFileAsync = promisify(fs.readFile);

// wpt-runner does not yet support unhandled rejection tracking a la
// https://github.com/w3c/testharness.js/commit/7716e2581a86dfd9405a9c00547a7504f0c7fe94
// So we emulate it with Node.js events
const rejections = new Map();
process.on('unhandledRejection', (reason, promise) => {
  rejections.set(promise, reason);
});

process.on('rejectionHandled', promise => {
  rejections.delete(promise);
});

main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});

async function main() {
  const supportsES2018 = runtimeSupportsAsyncGenerators();

  const excludedTests = [
    // We cannot polyfill TransferArrayBuffer yet, so disable tests for detached array buffers
    // See https://github.com/MattiasBuelens/web-streams-polyfill/issues/3
    'readable-byte-streams/detached-buffers.any.html'
  ];
  const ignoredFailures = {};

  if (!supportsES2018) {
    excludedTests.push([
      // Skip tests that use async generators or for-await-of
      'readable-streams/async-iterator.any.html',
      'readable-streams/patched-global.any.html'
    ]);
    ignoredFailures['readable-streams/general.any.html'] = [
      // Symbol.asyncIterator does not exist
      'ReadableStream instances should have the correct list of properties'
    ];
  }

  const ignoredFailuresES6 = {
    ...ignoredFailures,
    'readable-streams/async-iterator.any.html': [
      // ES6 build will not use correct %AsyncIteratorPrototype%
      'Async iterator instances should have the correct list of properties'
    ]
  };

  const ignoredFailuresES5 = {
    ...ignoredFailuresES6,
    // ES5 build does not set correct function name on constructors and methods
    // ES5 build does not set correct length on constructors and methods with optional arguments
    // ES5 build does not set correct 'enumerable' flag on properties and methods
    // ES5 build cannot mark methods as non-constructable
    'byte-length-queuing-strategy.any.html': [
      'ByteLengthQueuingStrategy.name is correct'
    ],
    'count-queuing-strategy.any.html': [
      'CountQueuingStrategy.name is correct'
    ],
    'readable-byte-streams/brand-checks.any.html': [
      'Can get the ReadableStreamBYOBReader constructor indirectly', // checks name
      'Can get the ReadableByteStreamController constructor indirectly' // checks name
    ],
    'readable-byte-streams/properties.any.html': [
      'ReadableStreamBYOBReader instances should have the correct list of properties',
      'ReadableByteStreamController instances should have the correct list of properties',
      'ReadableStreamBYOBRequest instances should have the correct list of properties'
    ],
    'readable-streams/default-reader.any.html': [
      'ReadableStreamDefaultReader instances should have the correct list of properties'
    ],
    'readable-streams/general.any.html': [
      'ReadableStream instances should have the correct list of properties',
      'ReadableStream start should be called with the proper parameters'
    ],
    'transform-streams/general.any.html': [
      'TransformStream instances must have writable and readable properties of the correct types'
    ],
    'transform-streams/properties.any.html': [
      /should be a constructor/,
      /should be a method/,
      /should have standard properties/
    ],
    'writable-streams/properties.any.html': [
      /should be a constructor/,
      /should be a method/,
      /should have standard properties/
    ]
  };

  let failures = 0;
  if (supportsES2018) {
    failures += await runTests('polyfill.es2018.min.js', { excludedTests, ignoredFailures });
  }
  failures += await runTests('polyfill.es6.min.js', {
    excludedTests,
    ignoredFailures: ignoredFailuresES6
  });
  failures += await runTests('polyfill.min.js', {
    excludedTests,
    ignoredFailures: ignoredFailuresES5
  });

  process.exitCode = failures;
}

async function runTests(entryFile, { excludedTests = [], ignoredFailures = {} } = {}) {
  const entryPath = path.resolve(__dirname, `../dist/${entryFile}`);
  const testsPath = path.resolve(__dirname, './web-platform-tests/streams');

  const includedTests = process.argv.length >= 3 ? process.argv.slice(2) : ['**/*.html'];
  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  const bundledJS = await readFileAsync(entryPath, { encoding: 'utf8' });

  console.log(`>>> ${entryFile}`);

  const wptFailures = await wptRunner(testsPath, {
    rootURL: 'streams/',
    reporter,
    setup(window) {
      window.gc = gc;
      window.eval(bundledJS);
    },
    filter(testPath) {
      return !workerTestPattern.test(testPath) && // ignore the worker versions
          includeMatcher(testPath) &&
          !excludeMatcher(testPath);
    }
  });
  const results = reporter.getResults();

  console.log();
  console.log(`${results.passed} tests passed, ${results.failed} failed, ${results.ignored} ignored`);

  let failures = Math.max(results.failed, wptFailures - results.ignored);

  if (rejections.size > 0) {
    if (failures === 0) {
      failures = 1;
    }

    for (const reason of rejections.values()) {
      console.error('Unhandled promise rejection: ', reason.stack);
    }
  }

  console.log();

  return failures;
}

function runtimeSupportsAsyncGenerators() {
  try {
    // eslint-disable-next-line no-new-func
    Function('(async function* f() {})')();
    return true;
  } catch (e) {
    return false;
  }
}
