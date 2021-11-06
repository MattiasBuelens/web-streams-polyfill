import {
  CreateReadableByteStream,
  CreateReadableStream,
  IsReadableStream,
  ReadableByteStream,
  ReadableStream,
  ReadableStreamCancel,
  ReadableStreamReader
} from '../readable-stream';
import { ReadableStreamReaderGenericRelease } from './generic-reader';
import {
  AcquireReadableStreamDefaultReader,
  IsReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadRequest
} from './default-reader';
import {
  AcquireReadableStreamBYOBReader,
  IsReadableStreamBYOBReader,
  ReadableStreamBYOBReaderRead,
  ReadIntoRequest
} from './byob-reader';
import assert from '../../stub/assert';
import { newPromise, promiseResolvedWith, queueMicrotask, uponRejection } from '../helpers/webidl';
import {
  ReadableStreamDefaultController,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError
} from './default-controller';
import {
  IsReadableByteStreamController,
  ReadableByteStreamControllerClose,
  ReadableByteStreamControllerEnqueue,
  ReadableByteStreamControllerError,
  ReadableByteStreamControllerGetBYOBRequest,
  ReadableByteStreamControllerRespond,
  ReadableByteStreamControllerRespondWithNewView
} from './byte-stream-controller';
import { CreateArrayFromList } from '../abstract-ops/ecmascript';
import { CloneAsUint8Array } from '../abstract-ops/miscellaneous';

export function ReadableStreamTee<R>(stream: ReadableStream<R>,
                                     cloneForBranch2: boolean): [ReadableStream<R>, ReadableStream<R>] {
  assert(IsReadableStream(stream));
  assert(typeof cloneForBranch2 === 'boolean');
  if (IsReadableByteStreamController(stream._readableStreamController)) {
    return ReadableByteStreamTee(stream as unknown as ReadableByteStream) as
      unknown as [ReadableStream<R>, ReadableStream<R>];
  }
  return ReadableStreamDefaultTee(stream, cloneForBranch2);
}

export function ReadableStreamDefaultTee<R>(stream: ReadableStream<R>,
                                            cloneForBranch2: boolean): [ReadableStream<R>, ReadableStream<R>] {
  assert(IsReadableStream(stream));
  assert(typeof cloneForBranch2 === 'boolean');

  const reader = AcquireReadableStreamDefaultReader<R>(stream);

  let reading = false;
  let readAgain = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1: any;
  let reason2: any;
  let branch1: ReadableStream<R>;
  let branch2: ReadableStream<R>;

  let resolveCancelPromise: (value: undefined | Promise<undefined>) => void;
  const cancelPromise = newPromise<undefined>(resolve => {
    resolveCancelPromise = resolve;
  });

  function pullAlgorithm(): Promise<void> {
    if (reading) {
      readAgain = true;
      return promiseResolvedWith(undefined);
    }

    reading = true;

    const readRequest: ReadRequest<R> = {
      _chunkSteps: chunk => {
        // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
        // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
        // successful synchronously-available reads get ahead of asynchronously-available errors.
        queueMicrotask(() => {
          readAgain = false;
          const chunk1 = chunk;
          const chunk2 = chunk;

          // There is no way to access the cloning code right now in the reference implementation.
          // If we add one then we'll need an implementation for serializable objects.
          // if (!canceled2 && cloneForBranch2) {
          //   chunk2 = StructuredDeserialize(StructuredSerialize(chunk2));
          // }

          if (!canceled1) {
            ReadableStreamDefaultControllerEnqueue(
              branch1._readableStreamController as ReadableStreamDefaultController<R>,
              chunk1
            );
          }
          if (!canceled2) {
            ReadableStreamDefaultControllerEnqueue(
              branch2._readableStreamController as ReadableStreamDefaultController<R>,
              chunk2
            );
          }

          reading = false;
          if (readAgain) {
            pullAlgorithm();
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

export function ReadableByteStreamTee(stream: ReadableByteStream): [ReadableByteStream, ReadableByteStream] {
  assert(IsReadableStream(stream));
  assert(IsReadableByteStreamController(stream._readableStreamController));

  let reader: ReadableStreamReader<Uint8Array> = AcquireReadableStreamDefaultReader(stream);
  let reading = false;
  let readAgainForBranch1 = false;
  let readAgainForBranch2 = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1: any;
  let reason2: any;
  let branch1: ReadableByteStream;
  let branch2: ReadableByteStream;

  let resolveCancelPromise: (value: undefined | Promise<undefined>) => void;
  const cancelPromise = newPromise<void>(resolve => {
    resolveCancelPromise = resolve;
  });

  function forwardReaderError(thisReader: ReadableStreamReader<Uint8Array>) {
    uponRejection(thisReader._closedPromise, r => {
      if (thisReader !== reader) {
        return;
      }
      ReadableByteStreamControllerError(branch1._readableStreamController, r);
      ReadableByteStreamControllerError(branch2._readableStreamController, r);
      if (!canceled1 || !canceled2) {
        resolveCancelPromise(undefined);
      }
    });
  }

  function pullWithDefaultReader() {
    if (IsReadableStreamBYOBReader(reader)) {
      assert(reader._readIntoRequests.length === 0);
      ReadableStreamReaderGenericRelease(reader);

      reader = AcquireReadableStreamDefaultReader(stream);
      forwardReaderError(reader);
    }

    const readRequest: ReadRequest<Uint8Array> = {
      _chunkSteps: chunk => {
        // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
        // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
        // successful synchronously-available reads get ahead of asynchronously-available errors.
        queueMicrotask(() => {
          readAgainForBranch1 = false;
          readAgainForBranch2 = false;

          const chunk1 = chunk;
          let chunk2 = chunk;
          if (!canceled1 && !canceled2) {
            try {
              chunk2 = CloneAsUint8Array(chunk);
            } catch (cloneE) {
              ReadableByteStreamControllerError(branch1._readableStreamController, cloneE);
              ReadableByteStreamControllerError(branch2._readableStreamController, cloneE);
              resolveCancelPromise(ReadableStreamCancel(stream, cloneE));
              return;
            }
          }

          if (!canceled1) {
            ReadableByteStreamControllerEnqueue(branch1._readableStreamController, chunk1);
          }
          if (!canceled2) {
            ReadableByteStreamControllerEnqueue(branch2._readableStreamController, chunk2);
          }

          reading = false;
          if (readAgainForBranch1) {
            pull1Algorithm();
          } else if (readAgainForBranch2) {
            pull2Algorithm();
          }
        });
      },
      _closeSteps: () => {
        reading = false;
        if (!canceled1) {
          ReadableByteStreamControllerClose(branch1._readableStreamController);
        }
        if (!canceled2) {
          ReadableByteStreamControllerClose(branch2._readableStreamController);
        }
        if (branch1._readableStreamController._pendingPullIntos.length > 0) {
          ReadableByteStreamControllerRespond(branch1._readableStreamController, 0);
        }
        if (branch2._readableStreamController._pendingPullIntos.length > 0) {
          ReadableByteStreamControllerRespond(branch2._readableStreamController, 0);
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
  }

  function pullWithBYOBReader(view: ArrayBufferView, forBranch2: boolean) {
    if (IsReadableStreamDefaultReader<Uint8Array>(reader)) {
      assert(reader._readRequests.length === 0);
      ReadableStreamReaderGenericRelease(reader);

      reader = AcquireReadableStreamBYOBReader(stream);
      forwardReaderError(reader);
    }

    const byobBranch = forBranch2 ? branch2 : branch1;
    const otherBranch = forBranch2 ? branch1 : branch2;

    const readIntoRequest: ReadIntoRequest<ArrayBufferView> = {
      _chunkSteps: chunk => {
        // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
        // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
        // successful synchronously-available reads get ahead of asynchronously-available errors.
        queueMicrotask(() => {
          readAgainForBranch1 = false;
          readAgainForBranch2 = false;

          const byobCanceled = forBranch2 ? canceled2 : canceled1;
          const otherCanceled = forBranch2 ? canceled1 : canceled2;

          if (!otherCanceled) {
            let clonedChunk;
            try {
              clonedChunk = CloneAsUint8Array(chunk);
            } catch (cloneE) {
              ReadableByteStreamControllerError(byobBranch._readableStreamController, cloneE);
              ReadableByteStreamControllerError(otherBranch._readableStreamController, cloneE);
              resolveCancelPromise(ReadableStreamCancel(stream, cloneE));
              return;
            }
            if (!byobCanceled) {
              ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
            }
            ReadableByteStreamControllerEnqueue(otherBranch._readableStreamController, clonedChunk);
          } else if (!byobCanceled) {
            ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
          }

          reading = false;
          if (readAgainForBranch1) {
            pull1Algorithm();
          } else if (readAgainForBranch2) {
            pull2Algorithm();
          }
        });
      },
      _closeSteps: chunk => {
        reading = false;

        const byobCanceled = forBranch2 ? canceled2 : canceled1;
        const otherCanceled = forBranch2 ? canceled1 : canceled2;

        if (!byobCanceled) {
          ReadableByteStreamControllerClose(byobBranch._readableStreamController);
        }
        if (!otherCanceled) {
          ReadableByteStreamControllerClose(otherBranch._readableStreamController);
        }

        if (chunk !== undefined) {
          assert(chunk.byteLength === 0);

          if (!byobCanceled) {
            ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
          }
          if (!otherCanceled && otherBranch._readableStreamController._pendingPullIntos.length > 0) {
            ReadableByteStreamControllerRespond(otherBranch._readableStreamController, 0);
          }
        }

        if (!byobCanceled || !otherCanceled) {
          resolveCancelPromise(undefined);
        }
      },
      _errorSteps: () => {
        reading = false;
      }
    };
    ReadableStreamBYOBReaderRead(reader, view, readIntoRequest);
  }

  function pull1Algorithm(): Promise<void> {
    if (reading) {
      readAgainForBranch1 = true;
      return promiseResolvedWith(undefined);
    }

    reading = true;

    const byobRequest = ReadableByteStreamControllerGetBYOBRequest(branch1._readableStreamController);
    if (byobRequest === null) {
      pullWithDefaultReader();
    } else {
      pullWithBYOBReader(byobRequest._view!, false);
    }

    return promiseResolvedWith(undefined);
  }

  function pull2Algorithm(): Promise<void> {
    if (reading) {
      readAgainForBranch2 = true;
      return promiseResolvedWith(undefined);
    }

    reading = true;

    const byobRequest = ReadableByteStreamControllerGetBYOBRequest(branch2._readableStreamController);
    if (byobRequest === null) {
      pullWithDefaultReader();
    } else {
      pullWithBYOBReader(byobRequest._view!, true);
    }

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

  function startAlgorithm(): void {
    return;
  }

  branch1 = CreateReadableByteStream(startAlgorithm, pull1Algorithm, cancel1Algorithm);
  branch2 = CreateReadableByteStream(startAlgorithm, pull2Algorithm, cancel2Algorithm);

  forwardReaderError(reader);

  return [branch1, branch2];
}
