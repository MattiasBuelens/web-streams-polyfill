import type {
  ReadableByteStream,
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader,
  ReadableStreamReader
} from '../readable-stream';
import { IsReadableStream, ReadableStream } from '../readable-stream';
import assert from '../../stub/assert';
import { newPromise, promiseResolvedWith, uponPromise, uponRejection } from '../helpers/webidl';
import type { ReadableStreamDefaultController } from './default-controller';
import type { ReadableByteStreamController } from './byte-stream-controller';
import { IsReadableByteStreamController } from './byte-stream-controller';
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

  const reader = stream.getReader();

  let reading = false;
  let readAgain = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1: any;
  let reason2: any;
  let controller1: ReadableStreamDefaultController<R>;
  let controller2: ReadableStreamDefaultController<R>;

  let resolveCancelPromise: (value: void | Promise<void>) => void;
  const cancelPromise = newPromise<void>(resolve => {
    resolveCancelPromise = resolve;
  });

  function pullAlgorithm(): Promise<void> {
    if (reading) {
      readAgain = true;
      return promiseResolvedWith(undefined);
    }

    reading = true;

    uponPromise(reader.read(), result => {
      readAgain = false;

      if (result.done) {
        if (!canceled1) {
          controller1.close();
        }
        if (!canceled2) {
          controller2.close();
        }

        if (!canceled1 || !canceled2) {
          resolveCancelPromise(undefined);
        }
        return null;
      }

      const chunk = result.value;
      const chunk1 = chunk;
      const chunk2 = chunk;

      // There is no way to access the cloning code right now in the reference implementation.
      // If we add one then we'll need an implementation for serializable objects.
      // if (!canceled2 && cloneForBranch2) {
      //   chunk2 = StructuredDeserialize(StructuredSerialize(chunk2));
      // }

      if (!canceled1) {
        controller1.enqueue(chunk1);
      }
      if (!canceled2) {
        controller2.enqueue(chunk2);
      }

      reading = false;
      if (readAgain) {
        pullAlgorithm();
      }

      return null;
    }, () => {
      reading = false;
      return null;
    });

    return promiseResolvedWith(undefined);
  }

  function cancel1Algorithm(reason: any): Promise<void> {
    canceled1 = true;
    reason1 = reason;
    if (canceled2) {
      const compositeReason = [reason1, reason2];
      const cancelResult = reader.cancel(compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  function cancel2Algorithm(reason: any): Promise<void> {
    canceled2 = true;
    reason2 = reason;
    if (canceled1) {
      const compositeReason = [reason1, reason2];
      const cancelResult = reader.cancel(compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  const branch1 = new ReadableStream<R>({
    start(c) {
      controller1 = c;
    },
    pull: pullAlgorithm,
    cancel: cancel1Algorithm
  });

  const branch2 = new ReadableStream<R>({
    start(c) {
      controller2 = c;
    },
    pull: pullAlgorithm,
    cancel: cancel2Algorithm
  });

  uponRejection(reader.closed, (r: any) => {
    controller1.error(r);
    controller2.error(r);
    if (!canceled1 || !canceled2) {
      resolveCancelPromise(undefined);
    }
    return null;
  });

  return [branch1, branch2];
}

export function ReadableByteStreamTee(stream: ReadableByteStream): [ReadableByteStream, ReadableByteStream] {
  assert(IsReadableStream(stream));
  assert(IsReadableByteStreamController(stream._readableStreamController));

  let reader: ReadableStreamReader<Uint8Array> = stream.getReader();
  let isByobReader = false;
  let reading = false;
  let readAgainForBranch1 = false;
  let readAgainForBranch2 = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1: any;
  let reason2: any;
  let controller1: ReadableByteStreamController;
  let controller2: ReadableByteStreamController;

  let resolveCancelPromise: (value: void | Promise<void>) => void;
  const cancelPromise = newPromise<void>(resolve => {
    resolveCancelPromise = resolve;
  });

  function forwardReaderError(thisReader: ReadableStreamReader<Uint8Array>) {
    uponRejection(thisReader.closed, r => {
      if (thisReader !== reader) {
        return null;
      }
      controller1.error(r);
      controller2.error(r);
      if (!canceled1 || !canceled2) {
        resolveCancelPromise(undefined);
      }
      return null;
    });
  }

  function pullWithDefaultReader() {
    if (isByobReader) {
      // assert(reader._readIntoRequests.length === 0);
      reader.releaseLock();
      reader = stream.getReader();
      forwardReaderError(reader);
      isByobReader = false;
    }

    uponPromise((reader as ReadableStreamDefaultReader<Uint8Array>).read(), result => {
      readAgainForBranch1 = false;
      readAgainForBranch2 = false;

      if (result.done) {
        if (!canceled1) {
          controller1.close();
        }
        if (!canceled2) {
          controller2.close();
        }
        controller1.byobRequest?.respond(0);
        controller2.byobRequest?.respond(0);
        if (!canceled1 || !canceled2) {
          resolveCancelPromise(undefined);
        }
        return null;
      }

      const chunk = result.value;
      const chunk1 = chunk;
      let chunk2 = chunk;
      if (!canceled1 && !canceled2) {
        try {
          chunk2 = CloneAsUint8Array(chunk);
        } catch (cloneE) {
          controller1.error(cloneE);
          controller2.error(cloneE);
          resolveCancelPromise(reader.cancel(cloneE));
          return null;
        }
      }
      if (!canceled1) {
        controller1.enqueue(chunk1);
      }
      if (!canceled2) {
        controller2.enqueue(chunk2);
      }

      reading = false;
      if (readAgainForBranch1) {
        pull1Algorithm();
      } else if (readAgainForBranch2) {
        pull2Algorithm();
      }

      return null;
    }, () => {
      reading = false;
      return null;
    });
  }

  function pullWithBYOBReader(view: ArrayBufferView, forBranch2: boolean) {
    if (!isByobReader) {
      // assert(reader._readRequests.length === 0);
      reader.releaseLock();
      reader = stream.getReader({ mode: 'byob' });
      forwardReaderError(reader);
      isByobReader = true;
    }

    const byobController = forBranch2 ? controller2 : controller1;
    const otherController = forBranch2 ? controller1 : controller2;

    uponPromise((reader as ReadableStreamBYOBReader).read(view), result => {
      readAgainForBranch1 = false;
      readAgainForBranch2 = false;
      const byobCanceled = forBranch2 ? canceled2 : canceled1;
      const otherCanceled = forBranch2 ? canceled1 : canceled2;
      if (result.done) {
        if (!byobCanceled) {
          byobController.close();
        }
        if (!otherCanceled) {
          otherController.close();
        }
        const chunk = result.value;
        if (chunk !== undefined) {
          assert(chunk.byteLength === 0);
          if (!byobCanceled) {
            byobController.byobRequest!.respondWithNewView(chunk);
          }
          if (!otherCanceled) {
            otherController.byobRequest?.respond(0);
          }
        }
        if (!byobCanceled || !otherCanceled) {
          resolveCancelPromise(undefined);
        }
        return null;
      }

      const chunk = result.value;
      if (!otherCanceled) {
        let clonedChunk;
        try {
          clonedChunk = CloneAsUint8Array(chunk);
        } catch (cloneE) {
          byobController.error(cloneE);
          otherController.error(cloneE);
          resolveCancelPromise(reader.cancel(cloneE));
          return null;
        }
        if (!byobCanceled) {
          byobController.byobRequest!.respondWithNewView(chunk);
        }
        otherController.enqueue(clonedChunk);
      } else if (!byobCanceled) {
        byobController.byobRequest!.respondWithNewView(chunk);
      }

      reading = false;
      if (readAgainForBranch1) {
        pull1Algorithm();
      } else if (readAgainForBranch2) {
        pull2Algorithm();
      }

      return null;
    }, () => {
      reading = false;
      return null;
    });
  }

  function pull1Algorithm(): Promise<void> {
    if (reading) {
      readAgainForBranch1 = true;
      return promiseResolvedWith(undefined);
    }

    reading = true;

    const byobRequest = controller1.byobRequest;
    if (byobRequest === null) {
      pullWithDefaultReader();
    } else {
      pullWithBYOBReader(byobRequest.view!, false);
    }

    return promiseResolvedWith(undefined);
  }

  function pull2Algorithm(): Promise<void> {
    if (reading) {
      readAgainForBranch2 = true;
      return promiseResolvedWith(undefined);
    }

    reading = true;

    const byobRequest = controller2.byobRequest;
    if (byobRequest === null) {
      pullWithDefaultReader();
    } else {
      pullWithBYOBReader(byobRequest.view!, true);
    }

    return promiseResolvedWith(undefined);
  }

  function cancel1Algorithm(reason: any): Promise<void> {
    canceled1 = true;
    reason1 = reason;
    if (canceled2) {
      const compositeReason = [reason1, reason2];
      const cancelResult = reader.cancel(compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  function cancel2Algorithm(reason: any): Promise<void> {
    canceled2 = true;
    reason2 = reason;
    if (canceled1) {
      const compositeReason = [reason1, reason2];
      const cancelResult = reader.cancel(compositeReason);
      resolveCancelPromise(cancelResult);
    }
    return cancelPromise;
  }

  const branch1 = new ReadableStream<Uint8Array>({
    type: 'bytes',
    start(c) {
      controller1 = c;
    },
    pull: pull1Algorithm,
    cancel: cancel1Algorithm
  }) as ReadableByteStream;

  const branch2 = new ReadableStream<Uint8Array>({
    type: 'bytes',
    start(c) {
      controller2 = c;
    },
    pull: pull2Algorithm,
    cancel: cancel2Algorithm
  }) as ReadableByteStream;

  forwardReaderError(reader);

  return [branch1, branch2];
}
