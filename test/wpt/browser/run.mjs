import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import micromatch from 'micromatch';
import { chromium, firefox, webkit } from 'playwright';
import minimist from 'minimist';
import { setupServer } from './server.mjs';
import consoleReporter from 'wpt-runner/lib/console-reporter.js';
import { SourceFile } from 'wpt-runner/lib/internal/sourcefile.js';
import { FilteringReporter } from '../shared/filtering-reporter.mjs';
import { expectationsPath, readExpectations, writeExpectations } from '../shared/expectations.mjs';
import {
  excludedTestsBase,
  mergeIgnoredFailures,
  ignoredFailuresBase,
  ignoredFailuresMinified,
  ignoredFailuresES5
} from '../shared/exclusions.mjs';

const serverCloseAsync = promisify(http.Server.prototype.close);

const argv = minimist(process.argv.slice(2), {
  string: ['browser'],
  boolean: ['native', 'update-expectations']
});

main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

async function main() {
  const browserType = argv.browser || 'chromium';
  const includedTests = argv._.length > 0 ? argv._ : ['**/*.html'];
  const excludedTests = [...excludedTestsBase];

  const wptPath = path.resolve(import.meta.dirname, '../../web-platform-tests');
  const results = [];
  let server;
  let browser;
  let browserVersion;
  try {
    server = setupServer(wptPath, { rootURL: '/' });
    const urlPrefix = `http://127.0.0.1:${server.address().port}`;
    console.log(`Server running at ${urlPrefix}`);

    browser = await browserTypeByName(browserType).launch({
      executablePath: process.env.WPT_BROWSER_EXECUTABLE_PATH || undefined
    });
    browserVersion = browser.version();
    const testOptions = { includedTests, excludedTests, browser, wptPath, urlPrefix };
    if (argv.native) {
      // Run against the browser's own implementation, without loading any polyfill.
      // Known native failures are recorded per browser in an expectations file.
      const expectationsFile = expectationsPath(`native-${browserType}`);
      const result = await runTests({
        ...testOptions,
        entryFile: undefined,
        ignoredFailures: argv['update-expectations'] ? {} : await readExpectations(expectationsFile)
      });
      if (argv['update-expectations']) {
        if (argv._.length > 0) {
          throw new Error('Cannot update expectations when running a subset of the tests');
        }
        await writeExpectations(expectationsFile, result.testResults.failures, { browser: `${browserType} ${browserVersion}` });
        console.log(`Updated ${path.relative(process.cwd(), expectationsFile)}`);
        result.failures = 0;
      }
      results.push(result);
    } else {
      results.push(await runTests({
        ...testOptions,
        entryFile: 'polyfill.js',
        ignoredFailures: mergeIgnoredFailures(ignoredFailuresBase, ignoredFailuresMinified)
      }));
      results.push(await runTests({
        ...testOptions,
        entryFile: 'polyfill.es5.js',
        ignoredFailures: mergeIgnoredFailures(ignoredFailuresES5, ignoredFailuresMinified)
      }));
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await serverCloseAsync.call(server);
    }
  }

  const failures = results.reduce((sum, result) => sum + result.failures, 0);
  for (const { entryFile, testResults } of results) {
    console.log(`> ${entryFile ?? `native ${browserType} ${browserVersion}`}`);
    console.log(`  * ${testResults.passed} passed`);
    console.log(`  * ${testResults.failed} failed`);
    console.log(`  * ${testResults.ignored} ignored`);
    if (entryFile === undefined && testResults.unusedIgnoredFailures.length > 0) {
      console.log(`  * ${testResults.unusedIgnoredFailures.length} expected failures did not fail:`);
      for (const { suite, test } of testResults.unusedIgnoredFailures) {
        console.log(`    - ${suite}: ${test}`);
      }
    }
  }

  process.exitCode = failures;
}

async function runTests({ entryFile, includedTests, excludedTests, ignoredFailures, browser, wptPath, urlPrefix }) {
  const entryPath = entryFile && path.resolve(import.meta.dirname, `../../../dist/${entryFile}`);
  const testsBase = '/streams/';
  const testsPath = path.resolve(wptPath, 'streams');

  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;
  const testPaths = (await readTestPaths(testsPath)).filter((testPath) => {
    // Ignore the worker versions
    if (workerTestPattern.test(testPath)) {
      return false;
    }
    return includeMatcher(testPath) && !excludeMatcher(testPath);
  });

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  console.log(`>>> ${entryFile ?? 'native'}`);

  let context;
  try {
    context = await browser.newContext();
    if (entryPath) {
      await context.addInitScript({ path: entryPath });
    }
    await context.route(`${urlPrefix}/resources/testharnessreport.js`, (route) => {
      route.fulfill({
        body: `
            window.fetch_tests_from_worker = () => undefined;
            window.add_result_callback(({ name, status, message, stack }) => {
              window.__wptResultCallback({ name, status, message, stack });
            });
            window.add_completion_callback((tests, { status, message, stack }) => {
              window.__wptCompletionCallback({ status, message, stack });
            });
          `
      });
    });
    for (const testPath of testPaths) {
      reporter.startSuite(testPath);
      const page = await context.newPage();
      const testUrl = `${urlPrefix}${testsBase}${testPath}`;
      await runTest(page, testUrl, reporter);
      await page.close();
    }
  } finally {
    if (context) {
      await context.close();
    }
  }

  const wptFailures = 0;
  const testResults = reporter.getResults();
  const failures = Math.max(testResults.failed, wptFailures - testResults.ignored);

  console.log();

  return { entryFile, failures, testResults };
}

async function runTest(page, testUrl, reporter) {
  let hasFailed = false;
  let resolveDone;
  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });

  await page.exposeFunction('__wptResultCallback', (test) => {
    if (test.status === 0) {
      reporter.pass(test.name);
    } else if (test.status === 1) {
      reporter.fail(`${test.name}\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
      hasFailed = true;
    } else if (test.status === 2) {
      reporter.fail(`${test.name} (timeout)\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
      hasFailed = true;
    } else if (test.status === 3) {
      reporter.fail(`${test.name} (incomplete)\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
      hasFailed = true;
    } else if (test.status === 4) {
      reporter.fail(`${test.name} (precondition failed)\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
      hasFailed = true;
    } else {
      reporter.fail(`unknown test status: ${test.status}`);
      hasFailed = true;
    }
  });

  await page.exposeFunction('__wptCompletionCallback', (harnessStatus) => {
    if (harnessStatus.status === 0) {
      resolveDone(!hasFailed);
    } else if (harnessStatus.status === 1) {
      reporter.fail('test harness threw unexpected error');
      reporter.reportStack(`${harnessStatus.message}\n${harnessStatus.stack}`);
      resolveDone(false);
    } else if (harnessStatus.status === 2) {
      reporter.fail('test harness should not timeout');
      resolveDone(false);
    } else if (harnessStatus.status === 4) {
      reporter.fail('test harness precondition failed');
      reporter.reportStack(`${harnessStatus.message}\n${harnessStatus.stack}`);
      resolveDone(false);
    } else {
      reporter.fail(`unknown test harness status: ${harnessStatus.status}`);
      resolveDone(false);
    }
  });

  await page.goto(testUrl);
  return await donePromise;
}

function browserTypeByName(name) {
  switch (name) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    case 'chromium':
    default:
      return chromium;
  }
}

async function readTestPaths(testsPath) {
  const fileNames = await fs.readdir(testsPath, { recursive: true });

  const testFilePaths = [];
  for (const fileName of fileNames) {
    const sourceFile = new SourceFile(testsPath, fileName);
    testFilePaths.push(...sourceFile.testPaths());
  }

  return testFilePaths.sort();
}
