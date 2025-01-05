// This runs the web platform tests against the reference implementation, in Node.js using jsdom, for easier rapid
// development of the reference implementation and the web platform tests.

import path from 'node:path';
import fs from 'node:fs/promises';
import micromatch from 'micromatch';
import wptRunner from 'wpt-runner';
import consoleReporter from 'wpt-runner/lib/console-reporter.js';
import { FilteringReporter } from '../shared/filtering-reporter.mjs';
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

main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

async function main() {
  const includedTests = process.argv.length >= 3 ? process.argv.slice(2) : ['**/*.html'];
  const excludedTests = [
    ...excludedTestsBase,
    ...(runtimeSupportsAsyncGenerators() ? [] : excludedTestsNonES2018)
  ];

  const results = [];
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

  const failures = results.reduce((sum, result) => sum + result.failures, 0);
  for (const { entryFile, testResults, rejectionsCount } of results) {
    console.log(`> ${entryFile}`);
    console.log(`  * ${testResults.passed} passed`);
    console.log(`  * ${testResults.failed} failed`);
    console.log(`  * ${testResults.ignored} ignored`);
    if (rejectionsCount > 0) {
      console.log(`  * ${rejectionsCount} unhandled promise rejections`);
    }
  }

  process.exitCode = failures;
}

async function runTests(entryFile, { includedTests = ['**/*.html'], excludedTests = [], ignoredFailures = {} } = {}) {
  const entryPath = path.resolve(import.meta.dirname, `../../../dist/${entryFile}`);
  const wptPath = path.resolve(import.meta.dirname, '../../web-platform-tests');
  const testsPath = path.resolve(wptPath, 'streams');

  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  const bundledJS = await fs.readFile(entryPath, { encoding: 'utf8' });

  console.log(`>>> ${entryFile}`);

  const wptFailures = await wptRunner(testsPath, {
    rootURL: 'streams/',
    reporter,
    setup(window) {
      window.Promise.allSettled = Promise.allSettled;
      window.queueMicrotask = global.queueMicrotask;
      window.structuredClone = global.structuredClone;
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

  return { entryFile, failures, testResults, rejectionsCount: rejections.size };
}

function runtimeSupportsAsyncGenerators() {
  try {
    Function('(async function* f() {})')();
    return true;
  } catch {
    return false;
  }
}
