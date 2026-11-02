import * as baseline from 'web-streams-polyfill-baseline';
import * as polyfill from 'web-streams-polyfill';
import * as node from 'node:stream/web';

/**
 * The implementations to compare.
 * The last release of the polyfill is the baseline, so the table also shows how far we are from native streams.
 */
export const implementations = { baseline, polyfill, node };

/**
 * Creates a readable stream that enqueues `n` chunks, one chunk per `pull()` call.
 */
export function pullSource(impl, n, highWaterMark = 1) {
  let i = 0;
  return new impl.ReadableStream({
    pull(c) {
      if (i++ < n) {
        c.enqueue('a');
      } else {
        c.close();
      }
    }
  }, { highWaterMark });
}

/**
 * Creates a readable stream that enqueues `n` chunks, `bufferSize` chunks at a time.
 * https://github.com/nodejs/node/commit/199daab0b0822d6063a73b9362bfce8667d2a112
 */
export function bufferedSource(impl, n, bufferSize) {
  let enqueued = 0;
  return new impl.ReadableStream({
    start(controller) {
      // Pre-fill the buffer
      for (let i = 0; i < Math.min(bufferSize, n); i++) {
        controller.enqueue('a');
        enqueued++;
      }
    },
    pull(controller) {
      // Refill buffer when pulled
      const toEnqueue = Math.min(bufferSize, n - enqueued);
      for (let i = 0; i < toEnqueue; i++) {
        controller.enqueue('a');
        enqueued++;
      }
      if (enqueued >= n) {
        controller.close();
      }
    }
  }, {
    // Use buffer size as high watermark to allow pre-buffering
    highWaterMark: bufferSize
  });
}

/**
 * Creates a short-lived readable stream with 4 chunks, already enqueued and closed.
 */
export function fourChunkSource(impl) {
  return new impl.ReadableStream({
    start(c) {
      c.enqueue('a');
      c.enqueue('b');
      c.enqueue('c');
      c.enqueue('d');
      c.close();
    }
  });
}

/**
 * Creates a writable stream that discards all chunks.
 */
export function nullSink(impl, highWaterMark = 1) {
  return new impl.WritableStream({ write() {} }, { highWaterMark });
}

export const bufferSizes = [1, 10, 100, 1000];
