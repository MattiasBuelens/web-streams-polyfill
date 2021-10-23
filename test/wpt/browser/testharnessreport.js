window.fetch_tests_from_worker = () => undefined;
window.add_result_callback(({ name, status, message, stack }) => {
  window.__wptResultCallback({ name, status, message, stack });
});
window.add_completion_callback((tests, { status, message, stack }) => {
  window.__wptCompletionCallback({ status, message, stack });
});
