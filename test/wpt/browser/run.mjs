import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import micromatch from 'micromatch';
import { chromium, firefox, webkit } from 'playwright';
import minimist from 'minimist';
import { build } from 'rolldown';
import { setupServer } from './server.mjs';
import consoleReporter from 'wpt-runner/lib/console-reporter.js';
import { SourceFile } from 'wpt-runner/lib/internal/sourcefile.js';
import { FilteringReporter } from '../shared/filtering-reporter.mjs';
import { expectationsPath, readExpectations, writeExpectations } from '../shared/expectations.mjs';
import {
  excludedTestsBase,
  excludedTestsExtendNative,
  mergeIgnoredFailures,
  ignoredFailuresBase,
  ignoredFailuresMinified,
  ignoredFailuresES5,
  isReplacedTest,
  modifiedSuitePrefix,
  modifiedTestsPath,
  replacedTestsPatched,
  withoutReplacedTests
} from '../shared/exclusions.mjs';

const serverCloseAsync = promisify(http.Server.prototype.close);

const argv = minimist(process.argv.slice(2), {
  string: ['browser'],
  boolean: ['native', 'patched', 'extend-native', 'force', 'update-expectations']
});

// --patched and --extend-native both build on the browser's own implementation, and install the features that it's missing.
const patchesNative = argv.patched || argv['extend-native'];

main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

async function main() {
  const browserType = argv.browser || 'chromium';
  const includedTests = argv._.length > 0 ? argv._ : ['**/*.html'];
  const excludedTests = [...excludedTestsBase, ...(argv['extend-native'] ? excludedTestsExtendNative : [])];

  const wptPath = path.resolve(import.meta.dirname, '../../web-platform-tests');
  const results = [];
  let server;
  let modifiedServer;
  let browser;
  let browserVersion;
  try {
    server = setupServer(wptPath, { rootURL: '/' });
    const urlPrefix = `http://127.0.0.1:${server.address().port}`;
    console.log(`Server running at ${urlPrefix}`);
    // Our own modified tests are served by a second server, at the same paths as the WPT tests they replace.
    modifiedServer = setupServer(modifiedTestsPath, { rootURL: '/streams/' });
    const modifiedUrlPrefix = `http://127.0.0.1:${modifiedServer.address().port}`;

    browser = await browserTypeByName(browserType).launch({
      executablePath: process.env.WPT_BROWSER_EXECUTABLE_PATH || undefined
    });
    browserVersion = browser.version();
    const testOptions = {
      includedTests,
      excludedTests,
      browser,
      testRoots: [
        { testsPath: path.resolve(wptPath, 'streams'), urlPrefix, suitePrefix: '' },
        { testsPath: modifiedTestsPath, urlPrefix: modifiedUrlPrefix, suitePrefix: modifiedSuitePrefix }
      ]
    };
    if (argv.native || patchesNative) {
      // Run against the browser's own implementation, without loading the polyfill.
      // With --patched, first install the feature modules that the browser is missing.
      // With --extend-native, replace the global classes with those of `web-streams-polyfill/extend-native`.
      // With --patched --force, hide the browser's own features first, so all feature modules get installed,
      // and use our TransformStream (on top of native streams) for every transformer.
      // Known failures are recorded per browser in an expectations file.
      const mode = argv['extend-native'] ? 'extend-native' : !argv.patched ? 'native' : argv.force ? 'patched-forced' : 'patched';
      const label = `${mode} ${browserType} ${browserVersion}`;
      const expectationsFile = expectationsPath(`${mode}-${browserType}`);
      const result = await runTests({
        ...testOptions,
        label,
        // Without --force, this is exactly what `web-streams-polyfill/auto` does.
        initScript: argv['extend-native']
          ? { content: await bundleExtendNativeInstaller() }
          : !argv.patched ? undefined : argv.force ? { content: await bundleFeatureInstaller() } : { path: distPath('auto.js') },
        ignoredFailures: mergeIgnoredFailures(
          patchesNative ? replacedTestsPatched : {},
          argv['update-expectations'] ? {} : await readExpectations(expectationsFile)
        )
      });
      if (argv['update-expectations']) {
        if (argv._.length > 0) {
          throw new Error('Cannot update expectations when running a subset of the tests');
        }
        const failures = patchesNative ? withoutReplacedTests(result.testResults.failures) : result.testResults.failures;
        if (patchesNative) {
          // Patching must never break a test that passes natively.
          const nativeFailures = await readExpectations(expectationsPath(`native-${browserType}`));
          const regressions = findNewFailures(failures, nativeFailures);
          if (regressions.length > 0) {
            for (const { suite, test } of regressions) {
              console.error(`Fails when patched, but passes natively: ${suite}: ${test}`);
            }
            throw new Error(`${regressions.length} tests fail only when patched`);
          }
        }
        await writeExpectations(expectationsFile, failures, { browser: `${browserType} ${browserVersion}` });
        console.log(`Updated ${path.relative(process.cwd(), expectationsFile)}`);
        result.failures = 0;
      }
      results.push(result);
    } else {
      results.push(await runTests({
        ...testOptions,
        label: 'replace.js',
        initScript: { path: distPath('replace.js') },
        ignoredFailures: mergeIgnoredFailures(ignoredFailuresBase, ignoredFailuresMinified)
      }));
      results.push(await runTests({
        ...testOptions,
        label: 'replace.es5.js',
        initScript: { path: distPath('replace.es5.js') },
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
    if (modifiedServer) {
      await serverCloseAsync.call(modifiedServer);
    }
  }

  const failures = results.reduce((sum, result) => sum + result.failures, 0);
  for (const { label, testResults } of results) {
    console.log(`> ${label}`);
    console.log(`  * ${testResults.passed} passed`);
    console.log(`  * ${testResults.failed} failed`);
    console.log(`  * ${testResults.ignored} ignored`);
    const unusedIgnoredFailures = testResults.unusedIgnoredFailures.filter(({ suite, test }) => !isReplacedTest(suite, test));
    if ((argv.native || patchesNative) && unusedIgnoredFailures.length > 0) {
      console.log(`  * ${unusedIgnoredFailures.length} expected failures did not fail:`);
      for (const { suite, test } of unusedIgnoredFailures) {
        console.log(`    - ${suite}: ${test}`);
      }
    }
  }

  process.exitCode = failures;
}

function distPath(file) {
  return path.resolve(import.meta.dirname, '../../../dist', file);
}

/**
 * Bundles a classic script for --patched --force: it hides the browser's own features, installs all feature modules,
 * and makes every TransformStream use ours. (The feature modules are only published as ES modules.)
 */
async function bundleFeatureInstaller() {
  const forceFeatures = JSON.stringify(path.resolve(import.meta.dirname, '../shared/force-features.mjs'));
  return bundleScript(`
    import { installAll } from ${JSON.stringify(distPath('feature/index.mjs'))};
    import { hideNativeFeatures, forceOwnTransformStream } from ${forceFeatures};
    hideNativeFeatures(globalThis);
    installAll(globalThis);
    forceOwnTransformStream(globalThis);
  `);
}

/**
 * Bundles a classic script for --extend-native: it replaces the global classes with those of `web-streams-polyfill/extend-native`.
 */
async function bundleExtendNativeInstaller() {
  const extendNativeGlobals = JSON.stringify(path.resolve(import.meta.dirname, '../shared/extend-native-globals.mjs'));
  return bundleScript(`
    import * as extendNative from ${JSON.stringify(distPath('extend-native.mjs'))};
    import { installExtendNativeGlobals } from ${extendNativeGlobals};
    installExtendNativeGlobals(globalThis, extendNative);
  `);
}

/**
 * Bundles an ES module entry (given as source code) into a classic script.
 */
async function bundleScript(entry) {
  const result = await build({
    input: 'virtual:entry',
    plugins: [{
      name: 'virtual-entry',
      resolveId: id => (id === 'virtual:entry' ? id : undefined),
      load: id => (id === 'virtual:entry' ? entry : undefined)
    }],
    write: false,
    logLevel: 'warn',
    output: { format: 'iife' }
  });
  return result.output[0].code;
}

function findNewFailures(failures, expected) {
  const result = [];
  for (const suite of Object.keys(failures)) {
    const expectedNames = new Set((expected[suite] ?? []).map(String));
    for (const test of failures[suite]) {
      if (!expectedNames.has(test)) {
        result.push({ suite, test });
      }
    }
  }
  return result;
}

async function runTests({ label, initScript, includedTests, excludedTests, ignoredFailures, browser, testRoots }) {
  const testsBase = '/streams/';

  const includeMatcher = micromatch.matcher(includedTests);
  const excludeMatcher = micromatch.matcher(excludedTests);
  const workerTestPattern = /\.(?:dedicated|shared|service)worker(?:\.https)?\.html$/;
  const tests = [];
  for (const { testsPath, urlPrefix, suitePrefix } of testRoots) {
    for (const testPath of await readTestPaths(testsPath)) {
      // Ignore the worker versions
      if (!workerTestPattern.test(testPath) && includeMatcher(testPath) && !excludeMatcher(testPath)) {
        tests.push({ suite: suitePrefix + testPath, testUrl: `${urlPrefix}${testsBase}${testPath}` });
      }
    }
  }

  const reporter = new FilteringReporter(consoleReporter, ignoredFailures);

  console.log(`>>> ${label}`);

  let context;
  try {
    context = await browser.newContext();
    if (initScript) {
      await context.addInitScript(initScript);
    }
    for (const { urlPrefix } of testRoots) {
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
    }
    for (const { suite, testUrl } of tests) {
      reporter.startSuite(suite);
      const page = await context.newPage();
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

  return { label, failures, testResults };
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
