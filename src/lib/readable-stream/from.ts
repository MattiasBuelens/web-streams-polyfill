import { CreateReadableStream, type DefaultReadableStream } from '../readable-stream';
import {
  isReadableStreamLike,
  type ReadableStreamDefaultReaderLike,
  type ReadableStreamLike
} from './readable-stream-like';
import { ReadableStreamDefaultControllerClose, ReadableStreamDefaultControllerEnqueue } from './default-controller';
import { GetIterator, GetMethod, IteratorComplete, IteratorNext, IteratorValue } from '../abstract-ops/ecmascript';
import { promiseRejectedWith, promiseResolvedWith, reflectCall, transformPromiseWith } from '../helpers/webidl';
import { typeIsObject } from '../helpers/miscellaneous';
import { noop } from '../../utils';

export function ReadableStreamFrom<R>(
  source: Iterable<R> | AsyncIterable<R> | ReadableStreamLike<R>
): DefaultReadableStream<R> {
  if (isReadableStreamLike(source)) {
    return ReadableStreamFromDefaultReader(source.getReader());
  }
  return ReadableStreamFromIterable(source);
}

export function ReadableStreamFromIterable<R>(asyncIterable: Iterable<R> | AsyncIterable<R>): DefaultReadableStream<R> {
  let stream: DefaultReadableStream<R>;
  const iteratorRecord = GetIterator(asyncIterable, 'async');

  const startAlgorithm = noop;

  function pullAlgorithm(): Promise<void> {
    let nextResult;
    try {
      nextResult = IteratorNext(iteratorRecord);
    } catch (e) {
      return promiseRejectedWith(e);
    }
    const nextPromise = promiseResolvedWith(nextResult);
    return transformPromiseWith(nextPromise, iterResult => {
      if (!typeIsObject(iterResult)) {
        throw new TypeError('The promise returned by the iterator.next() method must fulfill with an object');
      }
      const done = IteratorComplete(iterResult);
      if (done) {
        ReadableStreamDefaultControllerClose(stream._readableStreamController);
      } else {
        const value = IteratorValue(iterResult);
        ReadableStreamDefaultControllerEnqueue(stream._readableStreamController, value);
      }
    });
  }

  function cancelAlgorithm(reason: any): Promise<void> {
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
    let returnResult: IteratorResult<R> | Promise<IteratorResult<R>>;
    try {
      returnResult = reflectCall(returnMethod, iterator, [reason]);
    } catch (e) {
      return promiseRejectedWith(e);
    }
    const returnPromise = promiseResolvedWith(returnResult);
    return transformPromiseWith(returnPromise, iterResult => {
      if (!typeIsObject(iterResult)) {
        throw new TypeError('The promise returned by the iterator.return() method must fulfill with an object');
      }
      return undefined;
    });
  }

  stream = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, 0);
  return stream;
}

export function ReadableStreamFromDefaultReader<R>(
  reader: ReadableStreamDefaultReaderLike<R>
): DefaultReadableStream<R> {
  let stream: DefaultReadableStream<R>;

  const startAlgorithm = noop;

  function pullAlgorithm(): Promise<void> {
    let readPromise;
    try {
      readPromise = reader.read();
    } catch (e) {
      return promiseRejectedWith(e);
    }
    return transformPromiseWith(readPromise, readResult => {
      if (!typeIsObject(readResult)) {
        throw new TypeError('The promise returned by the reader.read() method must fulfill with an object');
      }
      if (readResult.done) {
        ReadableStreamDefaultControllerClose(stream._readableStreamController);
      } else {
        const value = readResult.value;
        ReadableStreamDefaultControllerEnqueue(stream._readableStreamController, value);
      }
    });
  }

  function cancelAlgorithm(reason: any): Promise<void> {
    try {
      return promiseResolvedWith(reader.cancel(reason));
    } catch (e) {
      return promiseRejectedWith(e);
    }
  }

  stream = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, 0);
  return stream;
}
