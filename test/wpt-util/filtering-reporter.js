class FilteringReporter {
  constructor(reporter, ignoredFailures = {}) {
    this._reporter = reporter;
    this._ignoredFailures = ignoredFailures;

    this._currentSuite = '';
    this._passed = 0;
    this._failed = 0;
    this._ignored = 0;
  }

  startSuite(name) {
    this._currentSuite = name;
    this._reporter.startSuite(name);
  }

  pass(message) {
    this._passed++;
    this._reporter.pass(message);
  }

  fail(message) {
    const ignoredFailures = this._ignoredFailures[this._currentSuite];
    if (ignoredFailures && ignoredFailures.includes(message.trim())) {
      this._ignored++;
      this._reporter.fail(`${message.trim()} (ignored)\n`);
    } else {
      this._failed++;
      this._reporter.fail(message);
    }
  }

  reportStack(stack) {
    this._reporter.reportStack(stack);
  }

  getResults() {
    return {
      passed: this._passed,
      failed: this._failed,
      ignored: this._ignored
    };
  }
}

module.exports = {
  FilteringReporter
};
