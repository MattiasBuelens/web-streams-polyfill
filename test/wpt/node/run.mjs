// This runs the web platform tests against the reference implementation, in Node.js using jsdom, for easier rapid
// development of the reference implementation and the web platform tests.

import path from 'node:path';
import fs from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import micromatch from 'micromatch';
import minimist from 'minimist';
import wptRunner from 'wpt-runner';
import consoleReporter from 'wpt-runner/lib/console-reporter.js';
import { SourceFile } from 'wpt-runner/lib/internal/sourcefile.js';
import { FilteringReporter } from '../shared/filtering-reporter.mjs';
import { expectationsPath, readExpectations, writeExpectations } from '../shared/expectations.mjs';
import {
  excludedTestsNonES2018,
  excludedTestsBase,
  ignoredFailuresBase,
  ignoredFailuresMinified,
  ignoredFailuresES5,
  mergeIgnoredFailures,
  modifiedSuitePrefix,
  modifiedTestsPath,
  replacedTestsPatched,
  withoutReplacedTests
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

const argv = minimist(process.argv.slice(2), {
  boolean: ['native', 'patched', 'force', 'update-expectations']
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
  results.push(await runJsdomTests('polyfill.js', {
    includedTests,
    excludedTests,
    ignoredFailures: mergeIgnoredFailures(ignoredFailuresBase, ignoredFailuresMinified)
  }));
  results.push(await runJsdomTests('polyfill.es5.js', {
    includedTests,
    excludedTests,
    ignoredFailures: mergeIgnoredFailures(ignoredFailuresES5, ignoredFailuresMinified)
  }));
}

/**
 * Runs the tests against Node's own streams implementation.
 * With --patched, the feature modules are installed first: Node implements every feature,
 * so we hide the native ones to exercise our implementations against Node's streams.
 * With --patched --force, every TransformStream also uses our implementation on top of Node's streams.
 *
 * These tests don't use jsdom, since it runs scripts in a different realm than Node's own stream classes.
 * Instead, each test file runs in a worker thread, in Node's own realm.
 */
async function runNativeTests({ includedTests, excludedTests }) {
  const mode = !argv.patched ? 'native' : argv.force ? 'patched-forced' : 'patched';
  const label = `${mode} node ${process.version}`;
  const expectationsFile = expectationsPath(`${mode}-node`);

  const result = await runWorkerTests({
    label,
    featureInstaller: argv.patched
      ? path.resolve(import.meta.dirname, '../../../dist/feature/index.mjs')
      : undefined,
    force: argv.force,
    includedTests,
    excludedTests,
    ignoredFailures: mergeIgnoredFailures(
      argv.patched ? replacedTestsPatched : {},
      argv['update-expectations'] ? {} : await readExpectations(expectationsFile)
    )
  });

  if (argv['update-expectations']) {
    if (argv._.length > 0) {
      throw new Error('Cannot update expectations when running a subset of the tests');
    }
    const failures = argv.patched ? withoutReplacedTests(result.testResults.failures) : result.testResults.failures;
    if (argv.patched) {
      // Patching must never break a test that passes natively.
      const nativeFailures = await readExpectations(expectationsPath('native-node'));
      let regressions = 0;
      for (const suite of Object.keys(failures)) {
        const expected = new Set((nativeFailures[suite] ?? []).map(String));
        for (const test of failures[suite]) {
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
    await writeExpectations(expectationsFile, failures, { runtime: `node ${process.version}` });
    console.log(`Updated ${path.relative(process.cwd(), expectationsFile)}`);
    result.failures = 0;
  }

  return result;
}

async function runWorkerTests({ label, featureInstaller, force, includedTests, excludedTests, ignoredFailures }) {
  const wptPath = path.resolve(import.meta.dirname, '../../web-platform-tests');
  const testsPath = path.resolve(wptPath, 'streams');

  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  // Only the .any.js tests can run without a DOM.
  const tests = [];
  for (const { path: rootPath, suitePrefix } of testRoots(testsPath)) {
    for (const testPath of await readTestPaths(rootPath)) {
      if (testPath.endsWith('.any.html') && includeMatcher(testPath) && !excludeMatcher(testPath)) {
        tests.push({ suite: suitePrefix + testPath, testFile: path.resolve(rootPath, testPath.replace(/\.any\.html$/, '.any.js')) });
      }
    }
  }

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);
  let rejectionsCount = 0;

  console.log(`>>> ${label}`);

  for (const { suite, testFile } of tests) {
    reporter.startSuite(suite);
    const { results, harnessStatus, unhandledRejections } = await runWorker({ wptPath, testFile, featureInstaller, force });
    for (const test of results) {
      reportTestResult(reporter, test);
    }
    reportHarnessStatus(reporter, harnessStatus);
    for (const reason of unhandledRejections) {
      reporter.fail('unhandled promise rejection\n');
      reporter.reportStack(reason);
      rejectionsCount++;
    }
  }

  const testResults = reporter.getResults();
  console.log();

  return { label, failures: testResults.failed, testResults, rejectionsCount };
}

function runWorker(workerData, timeout = 60_000) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./native-worker.mjs', import.meta.url), { workerData });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ results: [], harnessStatus: { status: 2 }, unhandledRejections: [] });
    }, timeout);
    worker.once('message', (message) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(message);
    });
    worker.once('error', (e) => {
      clearTimeout(timer);
      resolve({ results: [], harnessStatus: { status: 1, message: e.message, stack: e.stack }, unhandledRejections: [] });
    });
  });
}

const testStatusSuffixes = ['', '', ' (timeout)', ' (incomplete)', ' (precondition failed)'];

function reportTestResult(reporter, { name, status, message, stack }) {
  if (status === 0) {
    reporter.pass(name);
  } else if (status in testStatusSuffixes) {
    reporter.fail(`${name}${testStatusSuffixes[status]}\n`);
    reporter.reportStack(`${message}\n${stack}`);
  } else {
    reporter.fail(`unknown test status: ${status}`);
  }
}

function reportHarnessStatus(reporter, { status, message, stack }) {
  if (status === 0) {
    return;
  }
  if (status === 1) {
    reporter.fail('test harness threw unexpected error');
    reporter.reportStack(`${message}\n${stack}`);
  } else if (status === 2) {
    reporter.fail('test harness should not timeout');
  } else if (status === 4) {
    reporter.fail('test harness precondition failed');
    reporter.reportStack(`${message}\n${stack}`);
  } else {
    reporter.fail(`unknown test harness status: ${status}`);
  }
}

async function readTestPaths(testsPath) {
  const fileNames = await fs.readdir(testsPath, { recursive: true });
  const testPaths = [];
  for (const fileName of fileNames) {
    testPaths.push(...new SourceFile(testsPath, fileName).testPaths());
  }
  return testPaths.sort();
}

/**
 * Runs the tests against a polyfill bundle, which is loaded inside the jsdom window of each test.
 */
async function runJsdomTests(entryFile, { includedTests = ['**/*.html'], excludedTests = [], ignoredFailures = {} } = {}) {
  const label = entryFile;
  const wptPath = path.resolve(import.meta.dirname, '../../web-platform-tests');
  const testsPath = path.resolve(wptPath, 'streams');

  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  const bundledJS = await fs.readFile(path.resolve(import.meta.dirname, `../../../dist/${entryFile}`), { encoding: 'utf8' });

  console.log(`>>> ${label}`);

  let wptFailures = 0;
  for (const { path: rootPath, suitePrefix } of testRoots(testsPath)) {
    wptFailures += await wptRunner(rootPath, {
      rootURL: 'streams/',
      reporter: prefixSuites(reporter, suitePrefix),
      setup,
      filter
    });
  }

  function setup(window) {
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

    window.eval(bundledJS);
  }

  function filter(testPath) {
    // Ignore the worker versions
    if (workerTestPattern.test(testPath)) {
      return false;
    }

    return includeMatcher(testPath)
      && !excludeMatcher(testPath);
  }

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

/**
 * The directories with tests: the WPT `streams/` directory, and our own modified tests.
 */
function testRoots(testsPath) {
  return [
    { path: testsPath, suitePrefix: '' },
    { path: modifiedTestsPath, suitePrefix: modifiedSuitePrefix }
  ];
}

/**
 * Wraps a reporter to add a prefix to each suite name.
 */
function prefixSuites(reporter, suitePrefix) {
  return {
    startSuite: name => reporter.startSuite(suitePrefix + name),
    pass: message => reporter.pass(message),
    fail: message => reporter.fail(message),
    reportStack: stack => reporter.reportStack(stack)
  };
}

function runtimeSupportsAsyncGenerators() {
  try {
    Function('(async function* f() {})')();
    return true;
  } catch {
    return false;
  }
}
