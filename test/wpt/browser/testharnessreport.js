window.fetch_tests_from_worker = () => undefined;

window.add_result_callback(({ name, status, message, stack }) => {
  window.__wptResultCallback({ name, status, message, stack });
});
window.add_completion_callback((tests, { status, message, stack }) => {
  window.__wptCompletionCallback({ status, message, stack });
});

const skippedTests = window.__wptSkippedTests;
const originalPromiseTest = window.promise_test;
window.promise_test = function (func, name, ...extras) {
  if (skippedTests && skippedTests.some(test => matches(test, name))) {
    // Replace the actual test with one that always fails
    func = async () => {
      window.assert_implements_optional(false, 'skipped');
    };
  }
  return originalPromiseTest(func, name, ...extras);
};

function matches(test, input) {
  if (typeof test === 'string') {
    return input.includes(test);
  }
  if (test instanceof RegExp) {
    return test.test(input);
  }
  return false;
}
