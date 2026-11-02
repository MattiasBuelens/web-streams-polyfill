/**
 * Operations that a TransformStream performs on its readable and writable sides.
 *
 * The TransformStream abstract operations only reach into the state of its two sides through these functions.
 * Everything else that the TransformStream needs (backpressure, the transformer algorithms, the finish promise)
 * is owned by the TransformStream and its controller.
 *
 * Keeping this boundary in one place means the TransformStream logic doesn't depend on how its sides are implemented.
 * Here, the sides are this library's own ReadableStream and WritableStream, so every operation is a direct call
 * to the corresponding abstract operation or a read of the corresponding internal slot.
 */

import type { DefaultReadableStream } from '../readable-stream';
import {
  ReadableStreamDefaultControllerCanCloseOrEnqueue,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError,
  ReadableStreamDefaultControllerGetDesiredSize,
  ReadableStreamDefaultControllerHasBackpressure
} from '../readable-stream/default-controller';
import { type WritableStream, WritableStreamDefaultControllerErrorIfNeeded } from '../writable-stream';

// Readable side

export function ReadableSideGetDesiredSize(readable: DefaultReadableStream): number | null {
  return ReadableStreamDefaultControllerGetDesiredSize(readable._readableStreamController);
}

export function ReadableSideCanCloseOrEnqueue(readable: DefaultReadableStream): boolean {
  return ReadableStreamDefaultControllerCanCloseOrEnqueue(readable._readableStreamController);
}

export function ReadableSideEnqueue<R>(readable: DefaultReadableStream<R>, chunk: R): void {
  ReadableStreamDefaultControllerEnqueue(readable._readableStreamController, chunk);
}

export function ReadableSideHasBackpressure(readable: DefaultReadableStream): boolean {
  return ReadableStreamDefaultControllerHasBackpressure(readable._readableStreamController);
}

export function ReadableSideClose(readable: DefaultReadableStream): void {
  ReadableStreamDefaultControllerClose(readable._readableStreamController);
}

export function ReadableSideError(readable: DefaultReadableStream, e: any): void {
  ReadableStreamDefaultControllerError(readable._readableStreamController, e);
}

export function ReadableSideIsErrored(readable: DefaultReadableStream): boolean {
  return readable._state === 'errored';
}

export function ReadableSideGetStoredError(readable: DefaultReadableStream): any {
  return readable._storedError;
}

// Writable side

export function WritableSideIsWritable(writable: WritableStream): boolean {
  return writable._state === 'writable';
}

export function WritableSideIsErroring(writable: WritableStream): boolean {
  return writable._state === 'erroring';
}

export function WritableSideIsErrored(writable: WritableStream): boolean {
  return writable._state === 'errored';
}

export function WritableSideGetStoredError(writable: WritableStream): any {
  return writable._storedError;
}

export function WritableSideErrorIfNeeded(writable: WritableStream, e: any): void {
  WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, e);
}
