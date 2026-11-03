import {
  isReadableStreamLike,
  type ReadableStreamDefaultReaderLike,
  type ReadableStreamLike
} from './readable-stream-like';
import type { ReadableStreamDefaultReadResult } from './default-reader';
import { GetIterator, GetMethod, IteratorNext } from '../abstract-ops/ecmascript';
import { promiseCall, promiseRejectedWith, promiseResolvedWith, transformPromiseWith } from '../helpers/webidl';
import { typeIsObject } from '../helpers/miscellaneous';

// This module must not depend on our own ReadableStream class,
// so that the native ReadableStream.from() feature can use it without pulling in the whole implementation.

/**
 * The controller operations that the sources created by {@link ReadableStreamFromSource} need.
 *
 * This lets the same sources drive either one of our own streams (through the abstract operations),
 * or a native stream (through the public controller methods).
 */
export interface FromSourceControllerOps<C> {
  enqueue(controller: C, chunk: any): void;

  close(controller: C): void;
}

/**
 * The pull and cancel algorithms of a stream created by `ReadableStream.from()`.
 * The stream must be created with a high water mark of 0.
 */
export interface FromSource<C> {
  pull(controller: C): Promise<void>;

  cancel(reason: any): Promise<void>;
}

/**
 * Creates the pull and cancel algorithms for `ReadableStream.from(source)`.
 * This synchronously gets the iterator (or reader) from `source`, so it can throw.
 */
export function ReadableStreamFromSource<R, C>(
  source: Iterable<R> | AsyncIterable<R> | ReadableStreamLike<R>,
  ops: FromSourceControllerOps<C>
): FromSource<C> {
  if (isReadableStreamLike(source)) {
    return ReadableStreamFromDefaultReader(source.getReader(), ops);
  }
  return ReadableStreamFromIterable(source, ops);
}

function ReadableStreamFromIterable<R, C>(
  asyncIterable: Iterable<R> | AsyncIterable<R>,
  ops: FromSourceControllerOps<C>
): FromSource<C> {
  const iteratorRecord = GetIterator(asyncIterable, 'async');

  // The controller is always the same, but it's only known when the stream calls pull() for the first time.
  let controller: C;

  // Optimization: create the reaction to the iterator results once, and re-use it for every pull.
  const onIterResult = (iterResult: IteratorResult<R>): void => {
    if (!typeIsObject(iterResult)) {
      throw new TypeError('The promise returned by the iterator.next() method must fulfill with an object');
    }
    const done = iterResult.done;
    if (done) {
      ops.close(controller);
    } else {
      const value = iterResult.value;
      ops.enqueue(controller, value);
    }
  };

  function pull(c: C): Promise<void> {
    controller = c;
    let nextResult;
    try {
      nextResult = IteratorNext(iteratorRecord);
    } catch (e) {
      return promiseRejectedWith(e);
    }
    const nextPromise = promiseResolvedWith(nextResult);
    return transformPromiseWith(nextPromise, onIterResult);
  }

  function cancel(reason: any): Promise<void> {
    const iterator = iteratorRecord.iterator;
    let returnMethod: (typeof iterator)['return'] | undefined;
    try {
      returnMethod = GetMethod(iterator, 'return');
    } catch (e) {
      return promiseRejectedWith(e);
    }
    if (returnMethod === undefined) {
      return promiseResolvedWith(undefined);
    }
    const returnPromise = promiseCall(returnMethod, iterator, [reason]);
    return transformPromiseWith(returnPromise, (iterResult) => {
      if (!typeIsObject(iterResult)) {
        throw new TypeError('The promise returned by the iterator.return() method must fulfill with an object');
      }
      return undefined;
    });
  }

  return { pull, cancel };
}

function ReadableStreamFromDefaultReader<R, C>(
  reader: ReadableStreamDefaultReaderLike<R>,
  ops: FromSourceControllerOps<C>
): FromSource<C> {
  // The controller is always the same, but it's only known when the stream calls pull() for the first time.
  let controller: C;

  // Optimization: create the reaction to the read results once, and re-use it for every pull.
  const onReadResult = (readResult: ReadableStreamDefaultReadResult<R>): void => {
    if (!typeIsObject(readResult)) {
      throw new TypeError('The promise returned by the reader.read() method must fulfill with an object');
    }
    if (readResult.done) {
      ops.close(controller);
    } else {
      const value = readResult.value;
      ops.enqueue(controller, value);
    }
  };

  function pull(c: C): Promise<void> {
    controller = c;
    let readPromise;
    try {
      readPromise = reader.read();
    } catch (e) {
      return promiseRejectedWith(e);
    }
    return transformPromiseWith(readPromise, onReadResult);
  }

  function cancel(reason: any): Promise<void> {
    try {
      return promiseResolvedWith(reader.cancel(reason));
    } catch (e) {
      return promiseRejectedWith(e);
    }
  }

  return { pull, cancel };
}
