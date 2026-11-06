// META: global=window,worker
'use strict';

// Relaxed copies of tests from streams/readable-byte-streams/read-min.any.js,
// for the byob-read-min feature module (see replacedTestsPatched in test/wpt/shared/exclusions.mjs).
// The feature implements read(view, { min }) by repeating native read(view) calls on the unfilled part of the view,
// so a partially filled read is not visible to the underlying source as one pending pull-into descriptor.
// These tests must pass both on the reference implementation and on the patched native implementation.

promise_test(async t => {
  let pullCount = 0;
  let firstViewByteLength;
  const rs = new ReadableStream({
    type: 'bytes',
    pull: t.step_func((c) => {
      firstViewByteLength = c.byobRequest.view.byteLength;
      c.byobRequest.view[0] = 0x01;
      c.byobRequest.respond(1);
      // Modified: the original test also checks c.byobRequest.view after respond().
      // With the feature, the native read is already fulfilled, so c.byobRequest is null.
      ++pullCount;
    })
  });

  await Promise.resolve();
  assert_equals(pullCount, 0, 'pull() must not have been called yet');

  const reader = rs.getReader({ mode: 'byob' });
  const read = reader.read(new Uint8Array(3), { min: 3 });
  assert_equals(pullCount, 1, 'pull() must have been called once');
  assert_equals(firstViewByteLength, 3, 'byteLength before respond() should be 3');

  reader.cancel().catch(t.unreached_func('cancel() should not reject'));

  const result = await read;
  assert_true(result.done, 'result.done');
  assert_equals(result.value, undefined, 'result.value');

  assert_equals(pullCount, 1, 'pull() must only be called once');

  await reader.closed;
}, 'ReadableStream with byte source: cancel() with partially filled pending read({ min }) request (modified)');

promise_test(async t => {
  let controller;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    pull: t.unreached_func('pull() should not be called'),
    type: 'bytes'
  });

  const reader = stream.getReader({ mode: 'byob' });
  const readPromise = reader.read(new Uint16Array(2), { min: 2 });

  controller.enqueue(new Uint8Array([0xaa, 0xbb, 0xcc]));
  // Modified: the original test requires controller.close() to throw.
  // With the feature, the native read already took the first element, so the half element
  // only makes the next native read fail.
  try {
    controller.close();
  } catch (e) {
    assert_equals(e.constructor, TypeError, 'controller.close() must throw a TypeError, if anything');
  }

  await promise_rejects_js(t, TypeError, readPromise, 'read() must fail');
  await promise_rejects_js(t, TypeError, reader.closed, 'reader.closed must reject');
}, 'ReadableStream with byte source: read({ min }) with 2-element Uint16Array, then 3 byte enqueue(), then close() must fail (modified)');
