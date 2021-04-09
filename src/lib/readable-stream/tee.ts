import { CreateReadableStream, IsReadableStream, ReadableStream, ReadableStreamCancel } from '../readable-stream';
import { AcquireReadableStreamDefaultReader, ReadableStreamDefaultReaderRead, ReadRequest } from './default-reader';
import assert from '../../stub/assert';
import { newPromise, promiseResolvedWith, queueMicrotask, uponRejection } from '../helpers/webidl';
import {
  ReadableStreamDefaultController,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError
} from './default-controller';
import { CreateArrayFromList } from '../abstract-ops/ecmascript';

export function ReadableStreamTee<R>(stream: ReadableStream<R>,
                                     cloneForBranch2: boolean): [ReadableStream<R>, ReadableStream<R>] {
  assert(IsReadableStream(stream));
  assert(typeof cloneForBranch2 === 'boolean');

  const reader = AcquireReadableStreamDefaultReader<R>(stream);

  let reading = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1: any;
  let reason2: any;
  let branch1: ReadableStream<R>;
  let branch2: ReadableStream<R>;

  let resolveCancelPromise: (reason: any) => void;
  const cancelPromise = newPromise<any>(resolve => {
    resolveCancelPromise = resolve;
  });

  function pullAlgorithm(): Promise<void> {
    if (reading) {
      return promiseResolvedWith(undefined);
    }

    reading = true;

    const readRequest: ReadRequest<R> = {
      _chunkSteps: value => {
        // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
        // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
        // successful synchronously-available reads get ahead of asynchronously-available errors.
        queueMicrotask(() => {
          reading = false;
          const value1 = value;
          const value2 = value;

          // There is no way to access the cloning code right now in the reference implementation.
          // If we add one then we'll need an implementation for serializable objects.
          // if (!canceled2 && cloneForBranch2) {
          //   value2 = StructuredDeserialize(StructuredSerialize(value2));
          // }

          if (!canceled1) {
            ReadableStreamDefaultControllerEnqueue(
              branch1._readableStreamController as ReadableStreamDefaultController<R>,
              value1
            );
          }

          if (!canceled2) {
            ReadableStreamDefaultControllerEnqueue(
              branch2._readableStreamController as ReadableStreamDefaultController<R>,
              value2
            );
          }
        });
      },
      _closeSteps: () => {
        reading = false;
        if (!canceled1) {
          ReadableStreamDefaultControllerClose(branch1._readableStreamController as ReadableStreamDefaultController<R>);
        }
        if (!canceled2) {
          ReadableStreamDefaultControllerClose(branch2._readableStreamController as ReadableStreamDefaultController<R>);
        }

        if (!canceled1 || !canceled2) {
          resolveCancelPromise(undefined);
        }
      },
      _errorSteps: () => {
        reading = false;
      }
    };
    ReadableStreamDefaultReaderRead(reader, readRequest);

    return promiseResolvedWith(undefined);
  }

  function cancel1Algorithm(reason: any): Promise<void> {
    canceled1 = true;
    reason1 = reason;
    if (canceled2) {
      const compositeReason = CreateArrayFromList([reason1, reason2]);
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  function cancel2Algorithm(reason: any): Promise<void> {
    canceled2 = true;
    reason2 = reason;
    if (canceled1) {
      const compositeReason = CreateArrayFromList([reason1, reason2]);
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  function startAlgorithm() {
    // do nothing
  }

  branch1 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel1Algorithm);
  branch2 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel2Algorithm);

  uponRejection(reader._closedPromise, (r: any) => {
    ReadableStreamDefaultControllerError(branch1._readableStreamController as ReadableStreamDefaultController<R>, r);
    ReadableStreamDefaultControllerError(branch2._readableStreamController as ReadableStreamDefaultController<R>, r);
    if (!canceled1 || !canceled2) {
      resolveCancelPromise(undefined);
    }
  });

  return [branch1, branch2];
}
