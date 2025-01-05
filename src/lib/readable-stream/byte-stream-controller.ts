import assert from '../../stub/assert';
import { SimpleQueue } from '../simple-queue';
import { ResetQueue } from '../abstract-ops/queue-with-sizes';
import {
  IsReadableStreamDefaultReader,
  ReadableStreamAddReadRequest,
  ReadableStreamFulfillReadRequest,
  ReadableStreamGetNumReadRequests,
  ReadableStreamHasDefaultReader,
  type ReadRequest
} from './default-reader';
import {
  ReadableStreamAddReadIntoRequest,
  ReadableStreamFulfillReadIntoRequest,
  ReadableStreamGetNumReadIntoRequests,
  ReadableStreamHasBYOBReader,
  type ReadIntoRequest
} from './byob-reader';
import NumberIsInteger from '../../stub/number-isinteger';
import {
  IsReadableStreamLocked,
  type ReadableByteStream,
  ReadableStreamClose,
  ReadableStreamError
} from '../readable-stream';
import type { ValidatedUnderlyingByteSource } from './underlying-source';
import { setFunctionName, typeIsObject } from '../helpers/miscellaneous';
import {
  ArrayBufferSlice,
  CanCopyDataBlockBytes,
  CanTransferArrayBuffer,
  CopyDataBlockBytes,
  IsDetachedBuffer,
  TransferArrayBuffer
} from '../abstract-ops/ecmascript';
import { CancelSteps, PullSteps, ReleaseSteps } from '../abstract-ops/internal-methods';
import { promiseResolvedWith, uponPromise } from '../helpers/webidl';
import { assertRequiredArgument, convertUnsignedLongLongWithEnforceRange } from '../validators/basic';
import {
  type ArrayBufferViewConstructor,
  arrayBufferViewElementSize,
  type NonShared,
  type TypedArrayConstructor
} from '../helpers/array-buffer-view';

/**
 * A pull-into request in a {@link ReadableByteStreamController}.
 *
 * @public
 */
export class ReadableStreamBYOBRequest {
  /** @internal */
  _associatedReadableByteStreamController!: ReadableByteStreamController;
  /** @internal */
  _view!: NonShared<ArrayBufferView> | null;

  private constructor() {
    throw new TypeError('Illegal constructor');
  }

  /**
   * Returns the view for writing in to, or `null` if the BYOB request has already been responded to.
   */
  get view(): ArrayBufferView | null {
    if (!IsReadableStreamBYOBRequest(this)) {
      throw byobRequestBrandCheckException('view');
    }

    return this._view;
  }

  /**
   * Indicates to the associated readable byte stream that `bytesWritten` bytes were written into
   * {@link ReadableStreamBYOBRequest.view | view}, causing the result be surfaced to the consumer.
   *
   * After this method is called, {@link ReadableStreamBYOBRequest.view | view} will be transferred and no longer
   * modifiable.
   */
  respond(bytesWritten: number): void;
  respond(bytesWritten: number | undefined): void {
    if (!IsReadableStreamBYOBRequest(this)) {
      throw byobRequestBrandCheckException('respond');
    }
    assertRequiredArgument(bytesWritten, 1, 'respond');
    bytesWritten = convertUnsignedLongLongWithEnforceRange(bytesWritten, 'First parameter');

    if (this._associatedReadableByteStreamController === undefined) {
      throw new TypeError('This BYOB request has been invalidated');
    }

    if (IsDetachedBuffer(this._view!.buffer)) {
      throw new TypeError(`The BYOB request's buffer has been detached and so cannot be used as a response`);
    }

    assert(this._view!.byteLength > 0);
    assert(this._view!.buffer.byteLength > 0);

    ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
  }

  /**
   * Indicates to the associated readable byte stream that instead of writing into
   * {@link ReadableStreamBYOBRequest.view | view}, the underlying byte source is providing a new `ArrayBufferView`,
   * which will be given to the consumer of the readable byte stream.
   *
   * After this method is called, `view` will be transferred and no longer modifiable.
   */
  respondWithNewView(view: ArrayBufferView): void;
  respondWithNewView(view: NonShared<ArrayBufferView>): void {
    if (!IsReadableStreamBYOBRequest(this)) {
      throw byobRequestBrandCheckException('respondWithNewView');
    }
    assertRequiredArgument(view, 1, 'respondWithNewView');

    if (!ArrayBuffer.isView(view)) {
      throw new TypeError('You can only respond with array buffer views');
    }

    if (this._associatedReadableByteStreamController === undefined) {
      throw new TypeError('This BYOB request has been invalidated');
    }

    if (IsDetachedBuffer(view.buffer)) {
      throw new TypeError('The given view\'s buffer has been detached and so cannot be used as a response');
    }

    ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
  }
}

Object.defineProperties(ReadableStreamBYOBRequest.prototype, {
  respond: { enumerable: true },
  respondWithNewView: { enumerable: true },
  view: { enumerable: true }
});
setFunctionName(ReadableStreamBYOBRequest.prototype.respond, 'respond');
setFunctionName(ReadableStreamBYOBRequest.prototype.respondWithNewView, 'respondWithNewView');
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableStreamBYOBRequest.prototype, Symbol.toStringTag, {
    value: 'ReadableStreamBYOBRequest',
    configurable: true
  });
}

interface ByteQueueElement {
  buffer: ArrayBuffer;
  byteOffset: number;
  byteLength: number;
}

type PullIntoDescriptor<T extends NonShared<ArrayBufferView> = NonShared<ArrayBufferView>> =
  DefaultPullIntoDescriptor
  | BYOBPullIntoDescriptor<T>;

interface DefaultPullIntoDescriptor {
  buffer: ArrayBuffer;
  bufferByteLength: number;
  byteOffset: number;
  byteLength: number;
  bytesFilled: number;
  minimumFill: number;
  elementSize: number;
  viewConstructor: TypedArrayConstructor<Uint8Array>;
  readerType: 'default' | 'none';
}

interface BYOBPullIntoDescriptor<T extends NonShared<ArrayBufferView> = NonShared<ArrayBufferView>> {
  buffer: ArrayBuffer;
  bufferByteLength: number;
  byteOffset: number;
  byteLength: number;
  bytesFilled: number;
  minimumFill: number;
  elementSize: number;
  viewConstructor: ArrayBufferViewConstructor<T>;
  readerType: 'byob' | 'none';
}

/**
 * Allows control of a {@link ReadableStream | readable byte stream}'s state and internal queue.
 *
 * @public
 */
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
  _byobRequest: ReadableStreamBYOBRequest | null;
  /** @internal */
  _pendingPullIntos!: SimpleQueue<PullIntoDescriptor>;

  private constructor() {
    throw new TypeError('Illegal constructor');
  }

  /**
   * Returns the current BYOB pull request, or `null` if there isn't one.
   */
  get byobRequest(): ReadableStreamBYOBRequest | null {
    if (!IsReadableByteStreamController(this)) {
      throw byteStreamControllerBrandCheckException('byobRequest');
    }

    return ReadableByteStreamControllerGetBYOBRequest(this);
  }

  /**
   * Returns the desired size to fill the controlled stream's internal queue. It can be negative, if the queue is
   * over-full. An underlying byte source ought to use this information to determine when and how to apply backpressure.
   */
  get desiredSize(): number | null {
    if (!IsReadableByteStreamController(this)) {
      throw byteStreamControllerBrandCheckException('desiredSize');
    }

    return ReadableByteStreamControllerGetDesiredSize(this);
  }

  /**
   * Closes the controlled readable stream. Consumers will still be able to read any previously-enqueued chunks from
   * the stream, but once those are read, the stream will become closed.
   */
  close(): void {
    if (!IsReadableByteStreamController(this)) {
      throw byteStreamControllerBrandCheckException('close');
    }

    if (this._closeRequested) {
      throw new TypeError('The stream has already been closed; do not close it again!');
    }

    const state = this._controlledReadableByteStream._state;
    if (state !== 'readable') {
      throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be closed`);
    }

    ReadableByteStreamControllerClose(this);
  }

  /**
   * Enqueues the given chunk chunk in the controlled readable stream.
   * The chunk has to be an `ArrayBufferView` instance, or else a `TypeError` will be thrown.
   */
  enqueue(chunk: ArrayBufferView): void;
  enqueue(chunk: NonShared<ArrayBufferView>): void {
    if (!IsReadableByteStreamController(this)) {
      throw byteStreamControllerBrandCheckException('enqueue');
    }

    assertRequiredArgument(chunk, 1, 'enqueue');
    if (!ArrayBuffer.isView(chunk)) {
      throw new TypeError('chunk must be an array buffer view');
    }
    if (chunk.byteLength === 0) {
      throw new TypeError('chunk must have non-zero byteLength');
    }
    if (chunk.buffer.byteLength === 0) {
      throw new TypeError(`chunk's buffer must have non-zero byteLength`);
    }

    if (this._closeRequested) {
      throw new TypeError('stream is closed or draining');
    }

    const state = this._controlledReadableByteStream._state;
    if (state !== 'readable') {
      throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be enqueued to`);
    }

    ReadableByteStreamControllerEnqueue(this, chunk);
  }

  /**
   * Errors the controlled readable stream, making all future interactions with it fail with the given error `e`.
   */
  error(e: any = undefined): void {
    if (!IsReadableByteStreamController(this)) {
      throw byteStreamControllerBrandCheckException('error');
    }

    ReadableByteStreamControllerError(this, e);
  }

  /** @internal */
  [CancelSteps](reason: any): Promise<void> {
    ReadableByteStreamControllerClearPendingPullIntos(this);

    ResetQueue(this);

    const result = this._cancelAlgorithm(reason);
    ReadableByteStreamControllerClearAlgorithms(this);
    return result;
  }

  /** @internal */
  [PullSteps](readRequest: ReadRequest<NonShared<Uint8Array>>): void {
    const stream = this._controlledReadableByteStream;
    assert(ReadableStreamHasDefaultReader(stream));

    if (this._queueTotalSize > 0) {
      assert(ReadableStreamGetNumReadRequests(stream) === 0);

      ReadableByteStreamControllerFillReadRequestFromQueue(this, readRequest);
      return;
    }

    const autoAllocateChunkSize = this._autoAllocateChunkSize;
    if (autoAllocateChunkSize !== undefined) {
      let buffer: ArrayBuffer;
      try {
        buffer = new ArrayBuffer(autoAllocateChunkSize);
      } catch (bufferE) {
        readRequest._errorSteps(bufferE);
        return;
      }

      const pullIntoDescriptor: DefaultPullIntoDescriptor = {
        buffer,
        bufferByteLength: autoAllocateChunkSize,
        byteOffset: 0,
        byteLength: autoAllocateChunkSize,
        bytesFilled: 0,
        minimumFill: 1,
        elementSize: 1,
        viewConstructor: Uint8Array,
        readerType: 'default'
      };

      this._pendingPullIntos.push(pullIntoDescriptor);
    }

    ReadableStreamAddReadRequest(stream, readRequest);
    ReadableByteStreamControllerCallPullIfNeeded(this);
  }

  /** @internal */
  [ReleaseSteps](): void {
    if (this._pendingPullIntos.length > 0) {
      const firstPullInto = this._pendingPullIntos.peek();
      firstPullInto.readerType = 'none';

      this._pendingPullIntos = new SimpleQueue();
      this._pendingPullIntos.push(firstPullInto);
    }
  }
}

Object.defineProperties(ReadableByteStreamController.prototype, {
  close: { enumerable: true },
  enqueue: { enumerable: true },
  error: { enumerable: true },
  byobRequest: { enumerable: true },
  desiredSize: { enumerable: true }
});
setFunctionName(ReadableByteStreamController.prototype.close, 'close');
setFunctionName(ReadableByteStreamController.prototype.enqueue, 'enqueue');
setFunctionName(ReadableByteStreamController.prototype.error, 'error');
if (typeof Symbol.toStringTag === 'symbol') {
  Object.defineProperty(ReadableByteStreamController.prototype, Symbol.toStringTag, {
    value: 'ReadableByteStreamController',
    configurable: true
  });
}

// Abstract operations for the ReadableByteStreamController.

export function IsReadableByteStreamController(x: any): x is ReadableByteStreamController {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableByteStream')) {
    return false;
  }

  return x instanceof ReadableByteStreamController;
}

function IsReadableStreamBYOBRequest(x: any): x is ReadableStreamBYOBRequest {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_associatedReadableByteStreamController')) {
    return false;
  }

  return x instanceof ReadableStreamBYOBRequest;
}

function ReadableByteStreamControllerCallPullIfNeeded(controller: ReadableByteStreamController): void {
  const shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
  if (!shouldPull) {
    return;
  }

  if (controller._pulling) {
    controller._pullAgain = true;
    return;
  }

  assert(!controller._pullAgain);

  controller._pulling = true;

  // TODO: Test controller argument
  const pullPromise = controller._pullAlgorithm();
  uponPromise(
    pullPromise,
    () => {
      controller._pulling = false;

      if (controller._pullAgain) {
        controller._pullAgain = false;
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }

      return null;
    },
    (e) => {
      ReadableByteStreamControllerError(controller, e);
      return null;
    }
  );
}

function ReadableByteStreamControllerClearPendingPullIntos(controller: ReadableByteStreamController) {
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  controller._pendingPullIntos = new SimpleQueue();
}

function ReadableByteStreamControllerCommitPullIntoDescriptor<T extends NonShared<ArrayBufferView>>(
  stream: ReadableByteStream,
  pullIntoDescriptor: PullIntoDescriptor<T>
) {
  assert(stream._state !== 'errored');
  assert(pullIntoDescriptor.readerType !== 'none');

  let done = false;
  if (stream._state === 'closed') {
    assert(pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize === 0);
    done = true;
  }

  const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor<T>(pullIntoDescriptor);
  if (pullIntoDescriptor.readerType === 'default') {
    ReadableStreamFulfillReadRequest(stream, filledView as unknown as NonShared<Uint8Array>, done);
  } else {
    assert(pullIntoDescriptor.readerType === 'byob');
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
}

function ReadableByteStreamControllerCommitPullIntoDescriptors<T extends NonShared<ArrayBufferView>>(
  stream: ReadableByteStream,
  pullIntoDescriptors: ReadonlyArray<PullIntoDescriptor<T>>
) {
  for (let i = 0; i < pullIntoDescriptors.length; ++i) {
    ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptors[i]);
  }
}

function ReadableByteStreamControllerConvertPullIntoDescriptor<T extends NonShared<ArrayBufferView>>(pullIntoDescriptor: PullIntoDescriptor<T>): T {
  const bytesFilled = pullIntoDescriptor.bytesFilled;
  const elementSize = pullIntoDescriptor.elementSize;

  assert(bytesFilled <= pullIntoDescriptor.byteLength);
  assert(bytesFilled % elementSize === 0);

  return new pullIntoDescriptor.viewConstructor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize) as T;
}

function ReadableByteStreamControllerEnqueueChunkToQueue(
  controller: ReadableByteStreamController,
  buffer: ArrayBuffer,
  byteOffset: number,
  byteLength: number
) {
  controller._queue.push({ buffer, byteOffset, byteLength });
  controller._queueTotalSize += byteLength;
}

function ReadableByteStreamControllerEnqueueClonedChunkToQueue(
  controller: ReadableByteStreamController,
  buffer: ArrayBuffer,
  byteOffset: number,
  byteLength: number
) {
  let clonedChunk;
  try {
    clonedChunk = ArrayBufferSlice(buffer, byteOffset, byteOffset + byteLength);
  } catch (cloneE) {
    ReadableByteStreamControllerError(controller, cloneE);
    throw cloneE;
  }
  ReadableByteStreamControllerEnqueueChunkToQueue(controller, clonedChunk, 0, byteLength);
}

function ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(
  controller: ReadableByteStreamController,
  firstDescriptor: PullIntoDescriptor
) {
  assert(firstDescriptor.readerType === 'none');
  if (firstDescriptor.bytesFilled > 0) {
    ReadableByteStreamControllerEnqueueClonedChunkToQueue(
      controller,
      firstDescriptor.buffer,
      firstDescriptor.byteOffset,
      firstDescriptor.bytesFilled
    );
  }
  ReadableByteStreamControllerShiftPendingPullInto(controller);
}

function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(
  controller: ReadableByteStreamController,
  pullIntoDescriptor: PullIntoDescriptor
) {
  const maxBytesToCopy = Math.min(
    controller._queueTotalSize,
    pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled
  );
  const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;

  let totalBytesToCopyRemaining = maxBytesToCopy;
  let ready = false;
  assert(!IsDetachedBuffer(pullIntoDescriptor.buffer));
  assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.minimumFill);
  const remainderBytes = maxBytesFilled % pullIntoDescriptor.elementSize;
  const maxAlignedBytes = maxBytesFilled - remainderBytes;
  // A descriptor for a read() request that is not yet filled up to its minimum length will stay at the head
  // of the queue, so the underlying source can keep filling it.
  if (maxAlignedBytes >= pullIntoDescriptor.minimumFill) {
    totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }

  const queue = controller._queue;

  while (totalBytesToCopyRemaining > 0) {
    const headOfQueue = queue.peek();

    const bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);

    const destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    assert(CanCopyDataBlockBytes(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy));
    CopyDataBlockBytes(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);

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

  if (!ready) {
    assert(controller._queueTotalSize === 0);
    assert(pullIntoDescriptor.bytesFilled > 0);
    assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.minimumFill);
  }

  return ready;
}

function ReadableByteStreamControllerFillHeadPullIntoDescriptor(
  controller: ReadableByteStreamController,
  size: number,
  pullIntoDescriptor: PullIntoDescriptor
) {
  assert(controller._pendingPullIntos.length === 0 || controller._pendingPullIntos.peek() === pullIntoDescriptor);
  assert(controller._byobRequest === null);
  pullIntoDescriptor.bytesFilled += size;
}

function ReadableByteStreamControllerHandleQueueDrain(controller: ReadableByteStreamController) {
  assert(controller._controlledReadableByteStream._state === 'readable');

  if (controller._queueTotalSize === 0 && controller._closeRequested) {
    ReadableByteStreamControllerClearAlgorithms(controller);
    ReadableStreamClose(controller._controlledReadableByteStream);
  } else {
    ReadableByteStreamControllerCallPullIfNeeded(controller);
  }
}

function ReadableByteStreamControllerInvalidateBYOBRequest(controller: ReadableByteStreamController) {
  if (controller._byobRequest === null) {
    return;
  }

  controller._byobRequest._associatedReadableByteStreamController = undefined!;
  controller._byobRequest._view = null!;
  controller._byobRequest = null;
}

function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller: ReadableByteStreamController): PullIntoDescriptor[] {
  assert(!controller._closeRequested);

  const filledPullIntos: PullIntoDescriptor[] = [];
  while (controller._pendingPullIntos.length > 0) {
    if (controller._queueTotalSize === 0) {
      break;
    }

    const pullIntoDescriptor = controller._pendingPullIntos.peek();
    assert(pullIntoDescriptor.readerType !== 'none');

    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor)) {
      ReadableByteStreamControllerShiftPendingPullInto(controller);
      filledPullIntos.push(pullIntoDescriptor);
    }
  }

  return filledPullIntos;
}

function ReadableByteStreamControllerProcessReadRequestsUsingQueue(controller: ReadableByteStreamController) {
  const reader = controller._controlledReadableByteStream._reader;
  assert(IsReadableStreamDefaultReader(reader));
  while (reader._readRequests.length > 0) {
    if (controller._queueTotalSize === 0) {
      return;
    }
    const readRequest = reader._readRequests.shift();
    ReadableByteStreamControllerFillReadRequestFromQueue(controller, readRequest);
  }
}

export function ReadableByteStreamControllerPullInto<T extends NonShared<ArrayBufferView>>(
  controller: ReadableByteStreamController,
  view: T,
  min: number,
  readIntoRequest: ReadIntoRequest<T>
): void {
  const stream = controller._controlledReadableByteStream;

  const ctor = view.constructor as ArrayBufferViewConstructor<T>;
  const elementSize = arrayBufferViewElementSize(ctor);

  const { byteOffset, byteLength } = view;

  const minimumFill = min * elementSize;
  assert(minimumFill >= elementSize && minimumFill <= byteLength);
  assert(minimumFill % elementSize === 0);

  let buffer: ArrayBuffer;
  try {
    buffer = TransferArrayBuffer(view.buffer);
  } catch (e) {
    readIntoRequest._errorSteps(e);
    return;
  }

  const pullIntoDescriptor: BYOBPullIntoDescriptor<T> = {
    buffer,
    bufferByteLength: buffer.byteLength,
    byteOffset,
    byteLength,
    bytesFilled: 0,
    minimumFill,
    elementSize,
    viewConstructor: ctor,
    readerType: 'byob'
  };

  if (controller._pendingPullIntos.length > 0) {
    controller._pendingPullIntos.push(pullIntoDescriptor);

    // No ReadableByteStreamControllerCallPullIfNeeded() call since:
    // - No change happens on desiredSize
    // - The source has already been notified of that there's at least 1 pending read(view)

    ReadableStreamAddReadIntoRequest(stream, readIntoRequest);
    return;
  }

  if (stream._state === 'closed') {
    const emptyView = new ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, 0);
    readIntoRequest._closeSteps(emptyView);
    return;
  }

  if (controller._queueTotalSize > 0) {
    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor)) {
      const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor<T>(pullIntoDescriptor);

      ReadableByteStreamControllerHandleQueueDrain(controller);

      readIntoRequest._chunkSteps(filledView);
      return;
    }

    if (controller._closeRequested) {
      const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      readIntoRequest._errorSteps(e);
      return;
    }
  }

  controller._pendingPullIntos.push(pullIntoDescriptor);

  ReadableStreamAddReadIntoRequest<T>(stream, readIntoRequest);
  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

function ReadableByteStreamControllerRespondInClosedState(
  controller: ReadableByteStreamController,
  firstDescriptor: PullIntoDescriptor
) {
  assert(firstDescriptor.bytesFilled % firstDescriptor.elementSize === 0);

  if (firstDescriptor.readerType === 'none') {
    ReadableByteStreamControllerShiftPendingPullInto(controller);
  }

  const stream = controller._controlledReadableByteStream;
  if (ReadableStreamHasBYOBReader(stream)) {
    const filledPullIntos: PullIntoDescriptor[] = [];
    for (let i = 0; i < ReadableStreamGetNumReadIntoRequests(stream); ++i) {
      filledPullIntos.push(ReadableByteStreamControllerShiftPendingPullInto(controller));
    }
    ReadableByteStreamControllerCommitPullIntoDescriptors(stream, filledPullIntos);
  }
}

function ReadableByteStreamControllerRespondInReadableState(
  controller: ReadableByteStreamController,
  bytesWritten: number,
  pullIntoDescriptor: PullIntoDescriptor
) {
  assert(pullIntoDescriptor.bytesFilled + bytesWritten <= pullIntoDescriptor.byteLength);

  ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);

  if (pullIntoDescriptor.readerType === 'none') {
    ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, pullIntoDescriptor);
    const filledPullIntos = ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
    ReadableByteStreamControllerCommitPullIntoDescriptors(controller._controlledReadableByteStream, filledPullIntos);
    return;
  }

  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.minimumFill) {
    // A descriptor for a read() request that is not yet filled up to its minimum length will stay at the head
    // of the queue, so the underlying source can keep filling it.
    return;
  }

  ReadableByteStreamControllerShiftPendingPullInto(controller);

  const remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    ReadableByteStreamControllerEnqueueClonedChunkToQueue(
      controller,
      pullIntoDescriptor.buffer,
      end - remainderSize,
      remainderSize
    );
  }

  pullIntoDescriptor.bytesFilled -= remainderSize;
  const filledPullIntos = ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);

  ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);
  ReadableByteStreamControllerCommitPullIntoDescriptors(controller._controlledReadableByteStream, filledPullIntos);
}

function ReadableByteStreamControllerRespondInternal(controller: ReadableByteStreamController, bytesWritten: number) {
  const firstDescriptor = controller._pendingPullIntos.peek();
  assert(CanTransferArrayBuffer(firstDescriptor.buffer));

  ReadableByteStreamControllerInvalidateBYOBRequest(controller);

  const state = controller._controlledReadableByteStream._state;
  if (state === 'closed') {
    assert(bytesWritten === 0);
    ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
  } else {
    assert(state === 'readable');
    assert(bytesWritten > 0);
    ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
  }

  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

function ReadableByteStreamControllerShiftPendingPullInto(controller: ReadableByteStreamController): PullIntoDescriptor {
  assert(controller._byobRequest === null);
  const descriptor = controller._pendingPullIntos.shift()!;
  return descriptor;
}

function ReadableByteStreamControllerShouldCallPull(controller: ReadableByteStreamController): boolean {
  const stream = controller._controlledReadableByteStream;

  if (stream._state !== 'readable') {
    return false;
  }

  if (controller._closeRequested) {
    return false;
  }

  if (!controller._started) {
    return false;
  }

  if (ReadableStreamHasDefaultReader(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  if (ReadableStreamHasBYOBReader(stream) && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
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

export function ReadableByteStreamControllerClose(controller: ReadableByteStreamController) {
  const stream = controller._controlledReadableByteStream;

  if (controller._closeRequested || stream._state !== 'readable') {
    return;
  }

  if (controller._queueTotalSize > 0) {
    controller._closeRequested = true;

    return;
  }

  if (controller._pendingPullIntos.length > 0) {
    const firstPendingPullInto = controller._pendingPullIntos.peek();
    if (firstPendingPullInto.bytesFilled % firstPendingPullInto.elementSize !== 0) {
      const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      throw e;
    }
  }

  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamClose(stream);
}

export function ReadableByteStreamControllerEnqueue(
  controller: ReadableByteStreamController,
  chunk: NonShared<ArrayBufferView>
) {
  const stream = controller._controlledReadableByteStream;

  if (controller._closeRequested || stream._state !== 'readable') {
    return;
  }

  const { buffer, byteOffset, byteLength } = chunk;
  if (IsDetachedBuffer(buffer)) {
    throw new TypeError('chunk\'s buffer is detached and so cannot be enqueued');
  }
  const transferredBuffer = TransferArrayBuffer(buffer);

  if (controller._pendingPullIntos.length > 0) {
    const firstPendingPullInto = controller._pendingPullIntos.peek();
    if (IsDetachedBuffer(firstPendingPullInto.buffer)) {
      throw new TypeError('The BYOB request\'s buffer has been detached and so cannot be filled with an enqueued chunk');
    }
    ReadableByteStreamControllerInvalidateBYOBRequest(controller);
    firstPendingPullInto.buffer = TransferArrayBuffer(firstPendingPullInto.buffer);
    if (firstPendingPullInto.readerType === 'none') {
      ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, firstPendingPullInto);
    }
  }

  if (ReadableStreamHasDefaultReader(stream)) {
    ReadableByteStreamControllerProcessReadRequestsUsingQueue(controller);
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      assert(controller._pendingPullIntos.length === 0);
      ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    } else {
      assert(controller._queue.length === 0);
      if (controller._pendingPullIntos.length > 0) {
        assert(controller._pendingPullIntos.peek().readerType === 'default');
        ReadableByteStreamControllerShiftPendingPullInto(controller);
      }
      const transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
      ReadableStreamFulfillReadRequest(stream, transferredView as NonShared<Uint8Array>, false);
    }
  } else if (ReadableStreamHasBYOBReader(stream)) {
    // TODO: Ideally in this branch detaching should happen only if the buffer is not consumed fully.
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    const filledPullIntos = ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
    ReadableByteStreamControllerCommitPullIntoDescriptors(controller._controlledReadableByteStream, filledPullIntos);
  } else {
    assert(!IsReadableStreamLocked(stream));
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
  }

  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

export function ReadableByteStreamControllerError(controller: ReadableByteStreamController, e: any) {
  const stream = controller._controlledReadableByteStream;

  if (stream._state !== 'readable') {
    return;
  }

  ReadableByteStreamControllerClearPendingPullIntos(controller);

  ResetQueue(controller);
  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamError(stream, e);
}

export function ReadableByteStreamControllerFillReadRequestFromQueue(
  controller: ReadableByteStreamController,
  readRequest: ReadRequest<NonShared<Uint8Array>>
) {
  assert(controller._queueTotalSize > 0);

  const entry = controller._queue.shift();
  controller._queueTotalSize -= entry.byteLength;

  ReadableByteStreamControllerHandleQueueDrain(controller);

  const view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
  readRequest._chunkSteps(view as NonShared<Uint8Array>);
}

export function ReadableByteStreamControllerGetBYOBRequest(controller: ReadableByteStreamController): ReadableStreamBYOBRequest | null {
  if (controller._byobRequest === null && controller._pendingPullIntos.length > 0) {
    const firstDescriptor = controller._pendingPullIntos.peek();
    const view = new Uint8Array(
      firstDescriptor.buffer,
      firstDescriptor.byteOffset + firstDescriptor.bytesFilled,
      firstDescriptor.byteLength - firstDescriptor.bytesFilled
    );

    const byobRequest: ReadableStreamBYOBRequest = Object.create(ReadableStreamBYOBRequest.prototype);
    SetUpReadableStreamBYOBRequest(byobRequest, controller, view as NonShared<Uint8Array>);
    controller._byobRequest = byobRequest;
  }
  return controller._byobRequest;
}

function ReadableByteStreamControllerGetDesiredSize(controller: ReadableByteStreamController): number | null {
  const state = controller._controlledReadableByteStream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

export function ReadableByteStreamControllerRespond(controller: ReadableByteStreamController, bytesWritten: number) {
  assert(controller._pendingPullIntos.length > 0);

  const firstDescriptor = controller._pendingPullIntos.peek();
  const state = controller._controlledReadableByteStream._state;

  if (state === 'closed') {
    if (bytesWritten !== 0) {
      throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
    }
  } else {
    assert(state === 'readable');
    if (bytesWritten === 0) {
      throw new TypeError('bytesWritten must be greater than 0 when calling respond() on a readable stream');
    }
    if (firstDescriptor.bytesFilled + bytesWritten > firstDescriptor.byteLength) {
      throw new RangeError('bytesWritten out of range');
    }
  }

  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);

  ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
}

export function ReadableByteStreamControllerRespondWithNewView(
  controller: ReadableByteStreamController,
  view: NonShared<ArrayBufferView>
) {
  assert(controller._pendingPullIntos.length > 0);
  assert(!IsDetachedBuffer(view.buffer));

  const firstDescriptor = controller._pendingPullIntos.peek();
  const state = controller._controlledReadableByteStream._state;

  if (state === 'closed') {
    if (view.byteLength !== 0) {
      throw new TypeError('The view\'s length must be 0 when calling respondWithNewView() on a closed stream');
    }
  } else {
    assert(state === 'readable');
    if (view.byteLength === 0) {
      throw new TypeError('The view\'s length must be greater than 0 when calling respondWithNewView() on a readable stream');
    }
  }

  if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
    throw new RangeError('The region specified by view does not match byobRequest');
  }
  if (firstDescriptor.bufferByteLength !== view.buffer.byteLength) {
    throw new RangeError('The buffer of view has different capacity than byobRequest');
  }
  if (firstDescriptor.bytesFilled + view.byteLength > firstDescriptor.byteLength) {
    throw new RangeError('The region specified by view is larger than byobRequest');
  }

  const viewByteLength = view.byteLength;
  firstDescriptor.buffer = TransferArrayBuffer(view.buffer);
  ReadableByteStreamControllerRespondInternal(controller, viewByteLength);
}

export function SetUpReadableByteStreamController(
  stream: ReadableByteStream,
  controller: ReadableByteStreamController,
  startAlgorithm: () => void | PromiseLike<void>,
  pullAlgorithm: () => Promise<void>,
  cancelAlgorithm: (reason: any) => Promise<void>,
  highWaterMark: number,
  autoAllocateChunkSize: number | undefined
) {
  assert(stream._readableStreamController === undefined);
  if (autoAllocateChunkSize !== undefined) {
    assert(NumberIsInteger(autoAllocateChunkSize));
    assert(autoAllocateChunkSize > 0);
  }

  controller._controlledReadableByteStream = stream;

  controller._pullAgain = false;
  controller._pulling = false;

  controller._byobRequest = null;

  // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
  controller._queue = controller._queueTotalSize = undefined!;
  ResetQueue(controller);

  controller._closeRequested = false;
  controller._started = false;

  controller._strategyHWM = highWaterMark;

  controller._pullAlgorithm = pullAlgorithm;
  controller._cancelAlgorithm = cancelAlgorithm;

  controller._autoAllocateChunkSize = autoAllocateChunkSize;

  controller._pendingPullIntos = new SimpleQueue();

  stream._readableStreamController = controller;

  const startResult = startAlgorithm();
  uponPromise(
    promiseResolvedWith(startResult),
    () => {
      controller._started = true;

      assert(!controller._pulling);
      assert(!controller._pullAgain);

      ReadableByteStreamControllerCallPullIfNeeded(controller);
      return null;
    },
    (r) => {
      ReadableByteStreamControllerError(controller, r);
      return null;
    }
  );
}

export function SetUpReadableByteStreamControllerFromUnderlyingSource(
  stream: ReadableByteStream,
  underlyingByteSource: ValidatedUnderlyingByteSource,
  highWaterMark: number
) {
  const controller: ReadableByteStreamController = Object.create(ReadableByteStreamController.prototype);

  let startAlgorithm: () => void | PromiseLike<void>;
  let pullAlgorithm: () => Promise<void>;
  let cancelAlgorithm: (reason: any) => Promise<void>;

  if (underlyingByteSource.start !== undefined) {
    startAlgorithm = () => underlyingByteSource.start!(controller);
  } else {
    startAlgorithm = () => undefined;
  }
  if (underlyingByteSource.pull !== undefined) {
    pullAlgorithm = () => underlyingByteSource.pull!(controller);
  } else {
    pullAlgorithm = () => promiseResolvedWith(undefined);
  }
  if (underlyingByteSource.cancel !== undefined) {
    cancelAlgorithm = reason => underlyingByteSource.cancel!(reason);
  } else {
    cancelAlgorithm = () => promiseResolvedWith(undefined);
  }

  const autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
  if (autoAllocateChunkSize === 0) {
    throw new TypeError('autoAllocateChunkSize must be greater than 0');
  }

  SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize);
}

function SetUpReadableStreamBYOBRequest(
  request: ReadableStreamBYOBRequest,
  controller: ReadableByteStreamController,
  view: NonShared<ArrayBufferView>
) {
  assert(IsReadableByteStreamController(controller));
  assert(typeof view === 'object');
  assert(ArrayBuffer.isView(view));
  assert(!IsDetachedBuffer(view.buffer));
  request._associatedReadableByteStreamController = controller;
  request._view = view;
}

// Helper functions for the ReadableStreamBYOBRequest.

function byobRequestBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableStreamBYOBRequest.prototype.${name} can only be used on a ReadableStreamBYOBRequest`);
}

// Helper functions for the ReadableByteStreamController.

function byteStreamControllerBrandCheckException(name: string): TypeError {
  return new TypeError(`ReadableByteStreamController.prototype.${name} can only be used on a ReadableByteStreamController`);
}
