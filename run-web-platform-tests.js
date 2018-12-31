// This runs the web platform tests against the reference implementation, in Node.js using jsdom, for easier rapid
// development of the reference implementation and the web platform tests.
/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const wptRunner = require('wpt-runner');
const micromatch = require('micromatch');

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
  const entryPath = path.resolve(__dirname, 'dist/polyfill.es6.min.js');
  const testsPath = path.resolve(__dirname, 'spec/reference-implementation/web-platform-tests/streams');

  const includeGlobs = process.argv.length >= 3 ? process.argv.slice(2) : ['**/*.html'];
  const excludeGlobs = [
    // We cannot polyfill TransferArrayBuffer yet, so disable tests for detached array buffers
    // See https://github.com/MattiasBuelens/web-streams-polyfill/issues/3
    'readable-byte-streams/detached-buffers.*.html'
  ];
  const includeMatcher = micromatch.matcher(includeGlobs);
  const excludeMatcher = micromatch.matcher(excludeGlobs);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;

  const bundledJS = await readFileAsync(entryPath, { encoding: 'utf8' });

  const failures = await wptRunner(testsPath, {
    rootURL: 'streams/',
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

  process.exitCode = failures;

  if (rejections.size > 0) {
    if (failures === 0) {
      process.exitCode = 1;
    }

    for (const reason of rejections.values()) {
      console.error('Unhandled promise rejection: ', reason.stack);
    }
  }
}
