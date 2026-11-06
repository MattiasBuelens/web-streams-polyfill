export class FilteringReporter {
  constructor(reporter, ignoredFailures = {}) {
    this._reporter = reporter;
    this._ignoredFailures = ignoredFailures;

    this._currentSuite = '';
    this._suites = [];
    this._passed = 0;
    this._failed = 0;
    this._ignored = 0;
    this._failures = {};
    this._usedIgnoredFailures = new Set();
  }

  startSuite(name) {
    this._currentSuite = name;
    this._suites.push(name);
    this._reporter.startSuite(name);
  }

  pass(message) {
    this._passed++;
    this._reporter.pass(message);
  }

  fail(message) {
    message = message.trim();
    (this._failures[this._currentSuite] ??= []).push(message);
    const ignoredFailures = this._ignoredFailures[this._currentSuite];
    if (ignoredFailures) {
      for (const ignoredFailure of ignoredFailures) {
        if (matches(ignoredFailure, message)) {
          this._ignored++;
          this._usedIgnoredFailures.add(key(this._currentSuite, ignoredFailure));
          this._reporter.fail(`${message} (ignored)\n`);
          return;
        }
      }
    }
    this._failed++;
    this._reporter.fail(`${message} (UNEXPECTED FAILURE)\n`);
  }

  reportStack(stack) {
    this._reporter.reportStack(stack);
  }

  getResults() {
    return {
      passed: this._passed,
      failed: this._failed,
      ignored: this._ignored,
      // Every failure (ignored or not), grouped by suite.
      failures: this._failures,
      // Ignored failures of suites that ran, but which didn't match any failure.
      unusedIgnoredFailures: this._getUnusedIgnoredFailures()
    };
  }

  _getUnusedIgnoredFailures() {
    const unused = [];
    for (const suite of this._suites) {
      for (const ignoredFailure of this._ignoredFailures[suite] ?? []) {
        if (!this._usedIgnoredFailures.has(key(suite, ignoredFailure))) {
          unused.push({ suite, test: String(ignoredFailure) });
        }
      }
    }
    return unused;
  }
}

function key(suite, ignoredFailure) {
  return `${suite}\u0000${String(ignoredFailure)}`;
}

/**
 * An ignored failure that only matches a test with exactly this name,
 * whereas a plain string matches any test whose name contains it.
 */
export class ExactName {
  constructor(name) {
    this.name = name;
  }

  toString() {
    return this.name;
  }
}

function matches(test, input) {
  if (test instanceof ExactName) {
    return input === test.name;
  }
  if (typeof test === 'string') {
    return input.includes(test);
  }
  if (test instanceof RegExp) {
    return test.test(input);
  }
  return false;
}
