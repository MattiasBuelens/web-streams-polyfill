/**
 * Operations that a TransformStream performs on its readable and writable sides.
 *
 * The TransformStream abstract operations only reach into the state of its two sides through
 * the {@link TransformStreamSides} object stored on the stream. Everything else that the TransformStream needs
 * (backpressure, the transformer algorithms, the finish promise) is owned by the TransformStream and its controller.
 *
 * Keeping this boundary in one place means the TransformStream logic doesn't depend on how its sides are implemented.
 * {@link referenceSides} is used when the sides are this library's own ReadableStream and WritableStream,
 * so every operation is a direct call to the corresponding abstract operation or a read of the corresponding slot.
 */

import type { TransformStream } from '../transform-stream';
import {
  ReadableStreamDefaultControllerCanCloseOrEnqueue,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError,
  ReadableStreamDefaultControllerGetDesiredSize,
  ReadableStreamDefaultControllerHasBackpressure
} from '../readable-stream/default-controller';
import { WritableStreamDefaultControllerErrorIfNeeded } from '../writable-stream';

export interface TransformStreamSides {
  // Readable side
  readableGetDesiredSize(stream: TransformStream): number | null;
  readableCanCloseOrEnqueue(stream: TransformStream): boolean;
  readableEnqueue<O>(stream: TransformStream<any, O>, chunk: O): void;
  readableHasBackpressure(stream: TransformStream): boolean;
  readableClose(stream: TransformStream): void;
  readableError(stream: TransformStream, e: any): void;
  readableIsErrored(stream: TransformStream): boolean;
  readableGetStoredError(stream: TransformStream): any;

  // Writable side
  writableIsWritable(stream: TransformStream): boolean;
  writableIsErroring(stream: TransformStream): boolean;
  writableIsErrored(stream: TransformStream): boolean;
  writableGetStoredError(stream: TransformStream): any;
  writableErrorIfNeeded(stream: TransformStream, e: any): void;
}

export const referenceSides: TransformStreamSides = {
  readableGetDesiredSize(stream) {
    return ReadableStreamDefaultControllerGetDesiredSize(stream._readable._readableStreamController);
  },
  readableCanCloseOrEnqueue(stream) {
    return ReadableStreamDefaultControllerCanCloseOrEnqueue(stream._readable._readableStreamController);
  },
  readableEnqueue(stream, chunk) {
    ReadableStreamDefaultControllerEnqueue(stream._readable._readableStreamController, chunk);
  },
  readableHasBackpressure(stream) {
    return ReadableStreamDefaultControllerHasBackpressure(stream._readable._readableStreamController);
  },
  readableClose(stream) {
    ReadableStreamDefaultControllerClose(stream._readable._readableStreamController);
  },
  readableError(stream, e) {
    ReadableStreamDefaultControllerError(stream._readable._readableStreamController, e);
  },
  readableIsErrored(stream) {
    return stream._readable._state === 'errored';
  },
  readableGetStoredError(stream) {
    return stream._readable._storedError;
  },

  writableIsWritable(stream) {
    return stream._writable._state === 'writable';
  },
  writableIsErroring(stream) {
    return stream._writable._state === 'erroring';
  },
  writableIsErrored(stream) {
    return stream._writable._state === 'errored';
  },
  writableGetStoredError(stream) {
    return stream._writable._storedError;
  },
  writableErrorIfNeeded(stream, e) {
    WritableStreamDefaultControllerErrorIfNeeded(stream._writable._writableStreamController, e);
  }
};
