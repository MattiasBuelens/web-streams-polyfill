import assert from '../../stub/assert';
import { rethrowAssertionErrorRejection } from '../utils';
import { SimpleQueue } from '../simple-queue';
import {
  ArrayBufferCopy,
  CreateAlgorithmFromUnderlyingMethod,
  InvokeOrNoop,
  IsDetachedBuffer,
  IsFiniteNonNegativeNumber,
  TransferArrayBuffer,
  typeIsObject,
  ValidateAndNormalizeHighWaterMark
} from '../helpers';
import { ResetQueue } from '../queue-with-sizes';
import { ReadableStreamCreateReadResult, ReadResult } from './generic-reader';
import {
  ReadableStreamAddReadRequest,
  ReadableStreamFulfillReadRequest,
  ReadableStreamGetNumReadRequests,
  ReadableStreamHasDefaultReader
} from './default-reader';
import {
  ReadableStreamAddReadIntoRequest,
  ReadableStreamFulfillReadIntoRequest,
  ReadableStreamGetNumReadIntoRequests,
  ReadableStreamHasBYOBReader
} from './byob-reader';
import NumberIsInteger from '../../stub/number-isinteger';
import {
  IsReadableStreamLocked,
  ReadableByteStream,
  ReadableStreamClose,
  ReadableStreamError,
  UnderlyingByteSource
} from '../readable-stream';
import { CancelSteps, PullSteps } from './symbols';

export class ReadableStreamBYOBRequest {
  /** @internal */
  _associatedReadableByteStreamController!: ReadableByteStreamController;
  /** @internal */
  _view!: ArrayBufferView;

  /** @internal */
  constructor() {
    throw new TypeError('ReadableStreamBYOBRequest cannot be used directly');
  }

  get view(): ArrayBufferView {
    if (IsReadableStreamBYOBRequest(this) === false) {
      throw byobRequestBrandCheckException('view');
    }

    return this._view;
  }

  respond(bytesWritten: number): void {
    if (IsReadableStreamBYOBRequest(this) === false) {
      throw byobRequestBrandCheckException('respond');
    }

    if (this._associatedReadableByteStreamController === undefined) {
      throw new TypeError('This BYOB request has been invalidated');
    }

    if (IsDetachedBuffer(this._view.buffer) === true) {
      throw new TypeError('The BYOB request\'s buffer has been detached and so cannot be used as a response');
    }

    ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
  }

  respondWithNewView(view: ArrayBufferView): void {
    if (IsReadableStreamBYOBRequest(this) === false) {
      throw byobRequestBrandCheckException('respond');
    }

    if (this._associatedReadableByteStreamController === undefined) {
      throw new TypeError('This BYOB request has been invalidated');
    }

    if (!ArrayBuffer.isView(view)) {
      throw new TypeError('You can only respond with array buffer views');
    }

    if (IsDetachedBuffer(view.buffer) === true) {
      throw new TypeError('The supplied view\'s buffer has been detached and so cannot be used as a response');
    }

    ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
  }
}

interface ArrayBufferViewConstructor<T extends ArrayBufferView = ArrayBufferView> {
  new(buffer: ArrayBufferLike, byteOffset: number, length?: number): T;

  readonly prototype: T;
  readonly BYTES_PER_ELEMENT: number;
}

interface ByteQueueElement {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
}

type PullIntoDescriptor<T extends ArrayBufferView = ArrayBufferView> =
  DefaultPullIntoDescriptor
  | BYOBPullIntoDescriptor;

interface DefaultPullIntoDescriptor {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
  bytesFilled: number;
  elementSize: number;
  ctor: ArrayBufferViewConstructor<Uint8Array>;
  readerType: 'default';
}

interface BYOBPullIntoDescriptor<T extends ArrayBufferView = ArrayBufferView> {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
  bytesFilled: number;
  elementSize: number;
  ctor: ArrayBufferViewConstructor<T>;
  readerType: 'byob';
}

export class ReadableByteStreamController {
  /** @internal */
  _controlledReadableByteStream!: ReadableByteStream;
  /** @internal */
  _queue!: SimpleQueue<ByteQueueElement>;
  /** @internal */
  _queueTotalSize!: number;
  /** @internal */
  _started!: boolean;
  /** @internal */
  _closeRequested!: boolean;
  /** @internal */
  _pullAgain!: boolean;
  /** @internal */
  _pulling !: boolean;
  /** @internal */
  _strategyHWM!: number;
  /** @internal */
  _pullAlgorithm!: () => Promise<void>;
  /** @internal */
  _cancelAlgorithm!: (reason: any) => Promise<void>;
  /** @internal */
  _autoAllocateChunkSize: number | undefined;
  /** @internal */
  _byobRequest: ReadableStreamBYOBRequest | undefined;
  /** @internal */
  _pendingPullIntos!: SimpleQueue<PullIntoDescriptor>;

  /** @internal */
  constructor() {
    throw new TypeError('ReadableByteStreamController constructor cannot be used directly');
  }

  get byobRequest(): ReadableStreamBYOBRequest | undefined {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('byobRequest');
    }

    if (this._byobRequest === undefined && this._pendingPullIntos.length > 0) {
      const firstDescriptor = this._pendingPullIntos.peek();
      const view = new Uint8Array(firstDescriptor.buffer,
                                  firstDescriptor.byteOffset + firstDescriptor.bytesFilled,
                                  firstDescriptor.byteLength - firstDescriptor.bytesFilled);

      const byobRequest: ReadableStreamBYOBRequest = Object.create(ReadableStreamBYOBRequest.prototype);
      SetUpReadableStreamBYOBRequest(byobRequest, this, view);
      this._byobRequest = byobRequest;
    }

    return this._byobRequest;
  }

  get desiredSize(): number | null {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('desiredSize');
    }

    return ReadableByteStreamControllerGetDesiredSize(this);
  }

  close(): void {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('close');
    }

    if (this._closeRequested === true) {
      throw new TypeError('The stream has already been closed; do not close it again!');
    }

    const state = this._controlledReadableByteStream._state;
    if (state !== 'readable') {
      throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be closed`);
    }

    ReadableByteStreamControllerClose(this);
  }

  enqueue(chunk: ArrayBufferView): void {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('enqueue');
    }

    if (this._closeRequested === true) {
      throw new TypeError('stream is closed or draining');
    }

    const state = this._controlledReadableByteStream._state;
    if (state !== 'readable') {
      throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be enqueued to`);
    }

    if (!ArrayBuffer.isView(chunk)) {
      throw new TypeError('You can only enqueue array buffer views when using a ReadableByteStreamController');
    }

    if (IsDetachedBuffer(chunk.buffer) === true) {
      throw new TypeError('Cannot enqueue a view onto a detached ArrayBuffer');
    }

    ReadableByteStreamControllerEnqueue(this, chunk);
  }

  error(e: any): void {
    if (IsReadableByteStreamController(this) === false) {
      throw byteStreamControllerBrandCheckException('error');
    }

    ReadableByteStreamControllerError(this, e);
  }

  /** @internal */
  [CancelSteps](reason: any): Promise<void> {
    if (this._pendingPullIntos.length > 0) {
      const firstDescriptor = this._pendingPullIntos.peek();
      firstDescriptor.bytesFilled = 0;
    }

    ResetQueue(this);

    const result = this._cancelAlgorithm(reason);
    ReadableByteStreamControllerClearAlgorithms(this);
    return result;
  }

  /** @internal */
  [PullSteps](): Promise<ReadResult<ArrayBufferView>> {
    const stream = this._controlledReadableByteStream;
    assert(ReadableStreamHasDefaultReader(stream) === true);

    if (this._queueTotalSize > 0) {
      assert(ReadableStreamGetNumReadRequests(stream) === 0);

      const entry = this._queue.shift()!;
      this._queueTotalSize -= entry.byteLength;

      ReadableByteStreamControllerHandleQueueDrain(this);

      let view: ArrayBufferView;
      try {
        view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
      } catch (viewE) {
        return Promise.reject(viewE);
      }

      return Promise.resolve(ReadableStreamCreateReadResult(view, false, stream._reader!._forAuthorCode));
    }

    const autoAllocateChunkSize = this._autoAllocateChunkSize;
    if (autoAllocateChunkSize !== undefined) {
      let buffer: ArrayBuffer;
      try {
        buffer = new ArrayBuffer(autoAllocateChunkSize);
      } catch (bufferE) {
        return Promise.reject(bufferE);
      }

      const pullIntoDescriptor: DefaultPullIntoDescriptor = {
        buffer,
        byteOffset: 0,
        byteLength: autoAllocateChunkSize,
        bytesFilled: 0,
        elementSize: 1,
        ctor: Uint8Array,
        readerType: 'default'
      };

      this._pendingPullIntos.push(pullIntoDescriptor);
    }

    const promise = ReadableStreamAddReadRequest(stream);

    ReadableByteStreamControllerCallPullIfNeeded(this);

    return promise;
  }
}

// Abstract operations for the ReadableByteStreamController.

export function IsReadableByteStreamController(x: any): x is ReadableByteStreamController {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableByteStream')) {
    return false;
  }

  return true;
}

function IsReadableStreamBYOBRequest(x: any): x is ReadableStreamBYOBRequest {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_associatedReadableByteStreamController')) {
    return false;
  }

  return true;
}

function ReadableByteStreamControllerCallPullIfNeeded(controller: ReadableByteStreamController): void {
  const shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return;
  }

  assert(controller._pullAgain === false);

  controller._pulling = true;

  // TODO: Test controller argument
  const pullPromise = controller._pullAlgorithm();
  pullPromise.then(
    () => {
      controller._pulling = false;

      if (controller._pullAgain === true) {
        controller._pullAgain = false;
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }
    },
    e => {
      ReadableByteStreamControllerError(controller, e);
    }
  ).catch(rethrowAssertionErrorRejection);
}

function ReadableByteStreamControllerClearPendingPullIntos(controller: ReadableByteStreamController) {
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  controller._pendingPullIntos = new SimpleQueue();
}

function ReadableByteStreamControllerCommitPullIntoDescriptor<T extends ArrayBufferView>(stream: ReadableByteStream,
                                                                                         pullIntoDescriptor: PullIntoDescriptor<T>) {
  assert(stream._state !== 'errored');

  let done = false;
  if (stream._state === 'closed') {
    assert(pullIntoDescriptor.bytesFilled === 0);
    done = true;
  }

  const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor<T>(pullIntoDescriptor);
  if (pullIntoDescriptor.readerType === 'default') {
    ReadableStreamFulfillReadRequest(stream, filledView as unknown as Uint8Array, done);
  } else {
    assert(pullIntoDescriptor.readerType === 'byob');
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
}

function ReadableByteStreamControllerConvertPullIntoDescriptor<T extends ArrayBufferView>(pullIntoDescriptor: PullIntoDescriptor<T>): T {
  const bytesFilled = pullIntoDescriptor.bytesFilled;
  const elementSize = pullIntoDescriptor.elementSize;

  assert(bytesFilled <= pullIntoDescriptor.byteLength);
  assert(bytesFilled % elementSize === 0);

  return new pullIntoDescriptor.ctor(
    pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize) as T;
}

function ReadableByteStreamControllerEnqueueChunkToQueue(controller: ReadableByteStreamController,
                                                         buffer: ArrayBufferLike,
                                                         byteOffset: number,
                                                         byteLength: number) {
  controller._queue.push({ buffer, byteOffset, byteLength });
  controller._queueTotalSize += byteLength;
}

function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller: ReadableByteStreamController,
                                                                     pullIntoDescriptor: PullIntoDescriptor) {
  const elementSize = pullIntoDescriptor.elementSize;

  const currentAlignedBytes = pullIntoDescriptor.bytesFilled - pullIntoDescriptor.bytesFilled % elementSize;

  const maxBytesToCopy = Math.min(controller._queueTotalSize,
                                  pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
  const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
  const maxAlignedBytes = maxBytesFilled - maxBytesFilled % elementSize;

  let totalBytesToCopyRemaining = maxBytesToCopy;
  let ready = false;
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }

  const queue = controller._queue;

  while (totalBytesToCopyRemaining > 0) {
    const headOfQueue = queue.peek();

    const bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);

    const destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    ArrayBufferCopy(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);

    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller._queueTotalSize -= bytesToCopy;

    ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesToCopy, pullIntoDescriptor);

    totalBytesToCopyRemaining -= bytesToCopy;
  }

  if (ready === false) {
    assert(controller._queueTotalSize === 0);
    assert(pullIntoDescriptor.bytesFilled > 0);
    assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize);
  }

  return ready;
}

function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller: ReadableByteStreamController,
                                                                size: number,
                                                                pullIntoDescriptor: PullIntoDescriptor) {
  assert(controller._pendingPullIntos.length === 0 || controller._pendingPullIntos.peek() === pullIntoDescriptor);

  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  pullIntoDescriptor.bytesFilled += size;
}

function ReadableByteStreamControllerHandleQueueDrain(controller: ReadableByteStreamController) {
  assert(controller._controlledReadableByteStream._state === 'readable');

  if (controller._queueTotalSize === 0 && controller._closeRequested === true) {
    ReadableByteStreamControllerClearAlgorithms(controller);
    ReadableStreamClose(controller._controlledReadableByteStream);
  } else {
    ReadableByteStreamControllerCallPullIfNeeded(controller);
  }
}

function ReadableByteStreamControllerInvalidateBYOBRequest(controller: ReadableByteStreamController) {
  if (controller._byobRequest === undefined) {
    return;
  }

  controller._byobRequest._associatedReadableByteStreamController = undefined!;
  controller._byobRequest._view = undefined!;
  controller._byobRequest = undefined;
}

function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller: ReadableByteStreamController) {
  assert(controller._closeRequested === false);

  while (controller._pendingPullIntos.length > 0) {
    if (controller._queueTotalSize === 0) {
      return;
    }

    const pullIntoDescriptor = controller._pendingPullIntos.peek();

    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      ReadableByteStreamControllerShiftPendingPullInto(controller);

      ReadableByteStreamControllerCommitPullIntoDescriptor(
        controller._controlledReadableByteStream,
        pullIntoDescriptor
      );
    }
  }
}

export function ReadableByteStreamControllerPullInto<T extends ArrayBufferView>(controller: ReadableByteStreamController,
                                                                                view: T): Promise<ReadResult<T>> {
  const stream = controller._controlledReadableByteStream;

  let elementSize = 1;
  if (view.constructor !== DataView) {
    elementSize = (view.constructor as ArrayBufferViewConstructor<T>).BYTES_PER_ELEMENT;
  }

  const ctor = view.constructor as ArrayBufferViewConstructor<T>;

  const buffer = TransferArrayBuffer(view.buffer);
  const pullIntoDescriptor: BYOBPullIntoDescriptor<T> = {
    buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
    bytesFilled: 0,
    elementSize,
    ctor,
    readerType: 'byob'
  };

  if (controller._pendingPullIntos.length > 0) {
    controller._pendingPullIntos.push(pullIntoDescriptor);

    // No ReadableByteStreamControllerCallPullIfNeeded() call since:
    // - No change happens on desiredSize
    // - The source has already been notified of that there's at least 1 pending read(view)

    return ReadableStreamAddReadIntoRequest(stream);
  }

  if (stream._state === 'closed') {
    const emptyView = new ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, 0);
    return Promise.resolve(ReadableStreamCreateReadResult(emptyView, true, stream._reader!._forAuthorCode));
  }

  if (controller._queueTotalSize > 0) {
    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor<T>(pullIntoDescriptor);

      ReadableByteStreamControllerHandleQueueDrain(controller);

      return Promise.resolve(ReadableStreamCreateReadResult(filledView, false, stream._reader!._forAuthorCode));
    }

    if (controller._closeRequested === true) {
      const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      return Promise.reject(e);
    }
  }

  controller._pendingPullIntos.push(pullIntoDescriptor);

  const promise = ReadableStreamAddReadIntoRequest<T>(stream);

  ReadableByteStreamControllerCallPullIfNeeded(controller);

  return promise;
}

function ReadableByteStreamControllerRespondInClosedState(controller: ReadableByteStreamController,
                                                          firstDescriptor: PullIntoDescriptor) {
  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);

  assert(firstDescriptor.bytesFilled === 0);

  const stream = controller._controlledReadableByteStream;
  if (ReadableStreamHasBYOBReader(stream) === true) {
    while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
      const pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(controller);
      ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
    }
  }
}

function ReadableByteStreamControllerRespondInReadableState(controller: ReadableByteStreamController,
                                                            bytesWritten: number,
                                                            pullIntoDescriptor: PullIntoDescriptor) {
  if (pullIntoDescriptor.bytesFilled + bytesWritten > pullIntoDescriptor.byteLength) {
    throw new RangeError('bytesWritten out of range');
  }

  ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);

  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    // TODO: Figure out whether we should detach the buffer or not here.
    return;
  }

  ReadableByteStreamControllerShiftPendingPullInto(controller);

  const remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    const remainder = pullIntoDescriptor.buffer.slice(end - remainderSize, end);
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, remainder, 0, remainder.byteLength);
  }

  pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.bytesFilled -= remainderSize;
  ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);

  ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
}

function ReadableByteStreamControllerRespondInternal(controller: ReadableByteStreamController, bytesWritten: number) {
  const firstDescriptor = controller._pendingPullIntos.peek();

  const stream = controller._controlledReadableByteStream;

  if (stream._state === 'closed') {
    if (bytesWritten !== 0) {
      throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
    }

    ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
  } else {
    assert(stream._state === 'readable');

    ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
  }

  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

function ReadableByteStreamControllerShiftPendingPullInto(controller: ReadableByteStreamController): PullIntoDescriptor {
  const descriptor = controller._pendingPullIntos.shift()!;
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  return descriptor;
}

function ReadableByteStreamControllerShouldCallPull(controller: ReadableByteStreamController): boolean {
  const stream = controller._controlledReadableByteStream;

  if (stream._state !== 'readable') {
    return false;
  }

  if (controller._closeRequested === true) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (ReadableStreamHasDefaultReader(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  if (ReadableStreamHasBYOBReader(stream) === true && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
    return true;
  }

  const desiredSize = ReadableByteStreamControllerGetDesiredSize(controller);
  assert(desiredSize !== null);
  if (desiredSize! > 0) {
    return true;
  }

  return false;
}

function ReadableByteStreamControllerClearAlgorithms(controller: ReadableByteStreamController) {
  controller._pullAlgorithm = undefined!;
  controller._cancelAlgorithm = undefined!;
}

// A client of ReadableByteStreamController may use these functions directly to bypass state check.

function ReadableByteStreamControllerClose(controller: ReadableByteStreamController) {
  const stream = controller._controlledReadableByteStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  if (controller._queueTotalSize > 0) {
    controller._closeRequested = true;

    return;
  }

  if (controller._pendingPullIntos.length > 0) {
    const firstPendingPullInto = controller._pendingPullIntos.peek();
    if (firstPendingPullInto.bytesFilled > 0) {
      const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      throw e;
    }
  }

  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamClose(stream);
}

function ReadableByteStreamControllerEnqueue(controller: ReadableByteStreamController, chunk: ArrayBufferView) {
  const stream = controller._controlledReadableByteStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  const buffer = chunk.buffer;
  const byteOffset = chunk.byteOffset;
  const byteLength = chunk.byteLength;
  const transferredBuffer = TransferArrayBuffer(buffer);

  if (ReadableStreamHasDefaultReader(stream) === true) {
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    } else {
      assert(controller._queue.length === 0);

      const transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
      ReadableStreamFulfillReadRequest(stream, transferredView, false);
    }
  } else if (ReadableStreamHasBYOBReader(stream) === true) {
    // TODO: Ideally in this branch detaching should happen only if the buffer is not consumed fully.
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
  } else {
    assert(IsReadableStreamLocked(stream) === false);
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
  }

  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

function ReadableByteStreamControllerError(controller: ReadableByteStreamController, e: any) {
  const stream = controller._controlledReadableByteStream;

  if (stream._state !== 'readable') {
    return;
  }

  ReadableByteStreamControllerClearPendingPullIntos(controller);

  ResetQueue(controller);
  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamError(stream, e);
}

function ReadableByteStreamControllerGetDesiredSize(controller: ReadableByteStreamController): number | null {
  const stream = controller._controlledReadableByteStream;
  const state = stream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

function ReadableByteStreamControllerRespond(controller: ReadableByteStreamController, bytesWritten: number) {
  bytesWritten = Number(bytesWritten);
  if (IsFiniteNonNegativeNumber(bytesWritten) === false) {
    throw new RangeError('bytesWritten must be a finite');
  }

  assert(controller._pendingPullIntos.length > 0);

  ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
}

function ReadableByteStreamControllerRespondWithNewView(controller: ReadableByteStreamController,
                                                        view: ArrayBufferView) {
  assert(controller._pendingPullIntos.length > 0);

  const firstDescriptor = controller._pendingPullIntos.peek();

  if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
    throw new RangeError('The region specified by view does not match byobRequest');
  }
  if (firstDescriptor.byteLength !== view.byteLength) {
    throw new RangeError('The buffer of view has different capacity than byobRequest');
  }

  firstDescriptor.buffer = view.buffer;

  ReadableByteStreamControllerRespondInternal(controller, view.byteLength);
}

export function SetUpReadableByteStreamController(stream: ReadableByteStream,
                                                  controller: ReadableByteStreamController,
                                                  startAlgorithm: () => void | PromiseLike<void>,
                                                  pullAlgorithm: () => Promise<void>,
                                                  cancelAlgorithm: (reason: any) => Promise<void>,
                                                  highWaterMark: number,
                                                  autoAllocateChunkSize: number | undefined) {
  assert(stream._readableStreamController === undefined);
  if (autoAllocateChunkSize !== undefined) {
    assert(NumberIsInteger(autoAllocateChunkSize) === true);
    assert(autoAllocateChunkSize > 0);
  }

  controller._controlledReadableByteStream = stream;

  controller._pullAgain = false;
  controller._pulling = false;

  controller._byobRequest = undefined;

  // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
  controller._queue = controller._queueTotalSize = undefined!;
  ResetQueue(controller);

  controller._closeRequested = false;
  controller._started = false;

  controller._strategyHWM = ValidateAndNormalizeHighWaterMark(highWaterMark);

  controller._pullAlgorithm = pullAlgorithm;
  controller._cancelAlgorithm = cancelAlgorithm;

  controller._autoAllocateChunkSize = autoAllocateChunkSize;

  controller._pendingPullIntos = new SimpleQueue();

  stream._readableStreamController = controller;

  const startResult = startAlgorithm();
  Promise.resolve(startResult).then(
    () => {
      controller._started = true;

      assert(controller._pulling === false);
      assert(controller._pullAgain === false);

      ReadableByteStreamControllerCallPullIfNeeded(controller);
    },
    r => {
      ReadableByteStreamControllerError(controller, r);
    }
  ).catch(rethrowAssertionErrorRejection);
}

export function SetUpReadableByteStreamControllerFromUnderlyingSource(stream: ReadableByteStream,
                                                                      underlyingByteSource: UnderlyingByteSource,
                                                                      highWaterMark: number) {
  assert(underlyingByteSource !== undefined);

  const controller: ReadableByteStreamController = Object.create(ReadableByteStreamController.prototype);

  function startAlgorithm() {
    return InvokeOrNoop<typeof underlyingByteSource, 'start'>(underlyingByteSource, 'start', [controller]);
  }

  const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof underlyingByteSource, 'pull'>(
    underlyingByteSource, 'pull', 0, [controller]
  );
  const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod<typeof underlyingByteSource, 'cancel'>(
    underlyingByteSource, 'cancel', 1, []
  );

  let autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
  if (autoAllocateChunkSize !== undefined) {
    autoAllocateChunkSize = Number(autoAllocateChunkSize);
    if (NumberIsInteger(autoAllocateChunkSize) === false || autoAllocateChunkSize <= 0) {
      throw new RangeError('autoAllocateChunkSize must be a positive integer');
    }
  }

  SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark,
                                    autoAllocateChunkSize);
}

function SetUpReadableStreamBYOBRequest(request: ReadableStreamBYOBRequest,
                                        controller: ReadableByteStreamController,
                                        view: ArrayBufferView) {
  assert(IsReadableByteStreamController(controller) === true);
  assert(typeof view === 'object');
  assert(ArrayBuffer.isView(view) === true);
  assert(IsDetachedBuffer(view.buffer) === false);
  request._associatedReadableByteStreamController = controller;
  request._view = view;
}

// Helper functions for the ReadableStreamBYOBRequest.

function byobRequestBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableStreamBYOBRequest.prototype.${name} can only be used on a ReadableStreamBYOBRequest`);
}

// Helper functions for the ReadableByteStreamController.

function byteStreamControllerBrandCheckException(name: string): TypeError {
  return new TypeError(
    `ReadableByteStreamController.prototype.${name} can only be used on a ReadableByteStreamController`);
}
