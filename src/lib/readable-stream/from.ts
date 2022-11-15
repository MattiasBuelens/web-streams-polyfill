import { CreateReadableStream, type DefaultReadableStream } from '../readable-stream';
import { ReadableStreamDefaultControllerClose, ReadableStreamDefaultControllerEnqueue } from './default-controller';
import { GetIterator, GetMethod, IteratorComplete, IteratorNext, IteratorValue } from '../abstract-ops/ecmascript';
import { promiseRejectedWith, promiseResolvedWith, reflectCall, transformPromiseWith } from '../helpers/webidl';
import { typeIsObject } from '../helpers/miscellaneous';
import { noop } from '../../utils';

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
