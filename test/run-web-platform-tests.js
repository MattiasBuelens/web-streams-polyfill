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
  const ignoredFailuresES6 = {
    'readable-streams/async-iterator.any.html': [
      // ES6 build will not use correct %AsyncIteratorPrototype%
      'Async iterator instances should have the correct list of properties'
    ]
  };

  let failures = 0;
  failures += await runTests('polyfill.es2018.min.js');
  failures += await runTests('polyfill.es6.min.js', ignoredFailuresES6);

  process.exitCode = failures;
}

async function runTests(entryFile, ignoredFailures) {
  const entryPath = path.resolve(__dirname, `../dist/${entryFile}`);
  const testsPath = path.resolve(__dirname, './web-platform-tests/streams');

  const includeGlobs = process.argv.length >= 3 ? process.argv.slice(2) : ['**/*.html'];
  const excludeGlobs = [
    // We cannot polyfill TransferArrayBuffer yet, so disable tests for detached array buffers
    // See https://github.com/MattiasBuelens/web-streams-polyfill/issues/3
    'readable-byte-streams/detached-buffers.*.html'
  ];
  const includeMatcher = micromatch.matcher(includeGlobs);
  const excludeMatcher = micromatch.matcher(excludeGlobs);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  const bundledJS = await readFileAsync(entryPath, { encoding: 'utf8' });

  console.log(`>>> ${entryFile}`);

  let failures = await wptRunner(testsPath, {
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

  failures -= results.ignored;

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
