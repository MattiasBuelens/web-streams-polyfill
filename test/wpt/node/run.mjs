// This runs the web platform tests against the reference implementation, in Node.js using jsdom, for easier rapid
// development of the reference implementation and the web platform tests.

import path from 'node:path';
import fs from 'node:fs/promises';
import micromatch from 'micromatch';
import minimist from 'minimist';
import wptRunner from 'wpt-runner';
import consoleReporter from 'wpt-runner/lib/console-reporter.js';
import { FilteringReporter } from '../shared/filtering-reporter.mjs';
import { expectationsPath, readExpectations, writeExpectations } from '../shared/expectations.mjs';
import {
  excludedTestsNonES2018,
  excludedTestsBase,
  ignoredFailuresBase,
  ignoredFailuresMinified,
  ignoredFailuresES5,
  mergeIgnoredFailures
} from '../shared/exclusions.mjs';

// wpt-runner does not yet support unhandled rejection tracking a la
// https://github.com/w3c/testharness.js/commit/7716e2581a86dfd9405a9c00547a7504f0c7fe94
// So we emulate it with Node.js events
const rejections = new Map();
process.on('unhandledRejection', (reason, promise) => {
  rejections.set(promise, reason);
});

process.on('rejectionHandled', (promise) => {
  rejections.delete(promise);
});

// Polyfill ArrayBuffer.prototype.transfer for Node.js < 21
ArrayBuffer.prototype.transfer ??= function transfer() {
  return structuredClone(this, { transfer: [this] });
};

// Polyfill Promise.withResolvers for Node.js < 22
Promise.withResolvers ??= function () {
  let resolve;
  let reject;
  const promise = new this((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
};

const bufferTypes = [
  'ArrayBuffer',
  'SharedArrayBuffer',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'DataView'
];

// The stream classes that Node.js provides as globals.
const streamClasses = [
  'ReadableStream',
  'ReadableStreamDefaultController',
  'ReadableByteStreamController',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultReader',
  'ReadableStreamBYOBReader',
  'WritableStream',
  'WritableStreamDefaultController',
  'WritableStreamDefaultWriter',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'TransformStream',
  'TransformStreamDefaultController'
];

// (Sharing other intrinsics such as Promise or Object breaks testharness.js in jsdom.)
const realmIntrinsics = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError'
];

const argv = minimist(process.argv.slice(2), {
  boolean: ['native', 'patched', 'update-expectations']
});

main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

async function main() {
  const includedTests = argv._.length > 0 ? argv._.map(String) : ['**/*.html'];
  const excludedTests = [
    ...excludedTestsBase,
    ...(runtimeSupportsAsyncGenerators() ? [] : excludedTestsNonES2018)
  ];

  const results = [];
  if (argv.native || argv.patched) {
    results.push(await runNativeTests({ includedTests, excludedTests }));
  } else {
    await runPolyfillTests(results, { includedTests, excludedTests });
  }

  const failures = results.reduce((sum, result) => sum + result.failures, 0);
  for (const { label, testResults, rejectionsCount } of results) {
    console.log(`> ${label}`);
    console.log(`  * ${testResults.passed} passed`);
    console.log(`  * ${testResults.failed} failed`);
    console.log(`  * ${testResults.ignored} ignored`);
    if (rejectionsCount > 0) {
      console.log(`  * ${rejectionsCount} unhandled promise rejections`);
    }
    if ((argv.native || argv.patched) && testResults.unusedIgnoredFailures.length > 0) {
      console.log(`  * ${testResults.unusedIgnoredFailures.length} expected failures did not fail:`);
      for (const { suite, test } of testResults.unusedIgnoredFailures) {
        console.log(`    - ${suite}: ${test}`);
      }
    }
  }

  process.exitCode = failures;
}

async function runPolyfillTests(results, { includedTests, excludedTests }) {
  results.push(await runTests('polyfill.js', {
    includedTests,
    excludedTests,
    ignoredFailures: mergeIgnoredFailures(ignoredFailuresBase, ignoredFailuresMinified)
  }));
  results.push(await runTests('polyfill.es5.js', {
    includedTests,
    excludedTests,
    ignoredFailures: mergeIgnoredFailures(ignoredFailuresES5, ignoredFailuresMinified)
  }));
}

/**
 * Runs the tests against Node's own streams implementation.
 * With --patched, the feature modules are force-installed first: Node implements every feature,
 * so we remove the native ones to exercise our implementations against Node's streams.
 */
async function runNativeTests({ includedTests, excludedTests }) {
  const mode = argv.patched ? 'patched' : 'native';
  const label = `${mode} node ${process.version}`;
  const expectationsFile = expectationsPath(`${mode}-node`);

  if (argv.patched) {
    delete ReadableStream.from;
    delete ReadableStream.prototype.values;
    delete ReadableStream.prototype[Symbol.asyncIterator];
    const { installAll } = await import('../../../dist/feature/index.mjs');
    const report = installAll(globalThis);
    console.log(`Installed features: ${report.installed.join(', ')}`);
    if (!report.success || report.installed.length === 0) {
      throw new Error('Failed to install the feature modules');
    }
  }

  const result = await runTests(undefined, {
    label,
    includedTests,
    excludedTests,
    ignoredFailures: argv['update-expectations'] ? {} : await readExpectations(expectationsFile)
  });

  if (argv['update-expectations']) {
    if (argv._.length > 0) {
      throw new Error('Cannot update expectations when running a subset of the tests');
    }
    if (argv.patched) {
      // Patching must never break a test that passes natively.
      const nativeFailures = await readExpectations(expectationsPath('native-node'));
      let regressions = 0;
      for (const suite of Object.keys(result.testResults.failures)) {
        const expected = new Set((nativeFailures[suite] ?? []).map(String));
        for (const test of result.testResults.failures[suite]) {
          if (!expected.has(test)) {
            console.error(`Fails when patched, but passes natively: ${suite}: ${test}`);
            regressions++;
          }
        }
      }
      if (regressions > 0) {
        throw new Error(`${regressions} tests fail only when patched`);
      }
    }
    await writeExpectations(expectationsFile, result.testResults.failures, { runtime: `node ${process.version}` });
    console.log(`Updated ${path.relative(process.cwd(), expectationsFile)}`);
    result.failures = 0;
  }

  return result;
}

async function runTests(entryFile, { label = entryFile, includedTests = ['**/*.html'], excludedTests = [], ignoredFailures = {} } = {}) {
  const wptPath = path.resolve(import.meta.dirname, '../../web-platform-tests');
  const testsPath = path.resolve(wptPath, 'streams');

  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  const bundledJS = entryFile
    ? await fs.readFile(path.resolve(import.meta.dirname, `../../../dist/${entryFile}`), { encoding: 'utf8' })
    : undefined;

  console.log(`>>> ${label}`);

  const wptFailures = await wptRunner(testsPath, {
    rootURL: 'streams/',
    reporter,
    setup(window) {
      window.Promise.allSettled = Promise.allSettled;
      window.Promise.withResolvers = Promise.withResolvers;
      window.queueMicrotask = global.queueMicrotask;

      // jsdom does not yet support structuredClone, use parent implementation.
      window.structuredClone = global.structuredClone;

      // Use buffer types from parent for structuredClone and transfer to work.
      for (const name of bufferTypes) {
        window[name] = global[name];
      }

      window.fetch = async function (url) {
        const filePath = path.join(wptPath, url);
        if (!filePath.startsWith(wptPath)) {
          throw new TypeError('Invalid URL');
        }
        return {
          ok: true,
          async text() {
            return await fs.readFile(filePath, { encoding: 'utf8' });
          }
        };
      };

      if (bundledJS !== undefined) {
        window.eval(bundledJS);
      } else {
        // Use Node's own stream classes.
        for (const name of streamClasses) {
          window[name] = global[name];
        }
        // The tests run in jsdom's realm, while Node's streams throw errors from Node's realm.
        // Share the error constructors, so that e.g. assert_throws_js(TypeError, ...) recognizes them.
        for (const name of realmIntrinsics) {
          window[name] = global[name];
        }
      }
    },
    filter(testPath) {
      // Ignore the worker versions
      if (workerTestPattern.test(testPath)) {
        return false;
      }

      return includeMatcher(testPath)
        && !excludeMatcher(testPath);
    }
  });

  const testResults = reporter.getResults();
  let failures = Math.max(testResults.failed, wptFailures - testResults.ignored);

  if (rejections.size > 0) {
    if (failures === 0) {
      failures = 1;
    }

    console.log();
    for (const reason of rejections.values()) {
      console.error('Unhandled promise rejection: ', reason.stack);
    }
    rejections.clear();
  }

  console.log();

  return { label, failures, testResults, rejectionsCount: rejections.size };
}

function runtimeSupportsAsyncGenerators() {
  try {
    Function('(async function* f() {})')();
    return true;
  } catch {
    return false;
  }
}
