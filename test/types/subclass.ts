/*
 * This test verifies the type definitions of the subclass ponyfill.
 */
import { adopt, ReadableStream, TransformStream, WritableStream } from 'web-streams-polyfill/subclass';

const readable: ReadableStream<string> = new ReadableStream<string>();
const writable: WritableStream<string> = new WritableStream<string>();
const transform: TransformStream<string, number> = new TransformStream<string, number>();

const [branch1, branch2]: [ReadableStream<string>, ReadableStream<string>] = readable.tee();
const piped: ReadableStream<number> = readable.pipeThrough(transform);
const iterator = readable.values({ preventCancel: true });

// Native streams, e.g. from fetch() or the DOM
declare const nativeReadable: globalThis.ReadableStream<Uint8Array>;
declare const nativeWritable: globalThis.WritableStream<Uint8Array>;
declare const nativeTransform: globalThis.TransformStream<string, Uint8Array>;
const adoptedReadable: ReadableStream<Uint8Array> = adopt(nativeReadable);
const adoptedWritable: WritableStream<Uint8Array> = adopt(nativeWritable);
const adoptedTransform: TransformStream<string, Uint8Array> = adopt(nativeTransform);
const adoptedOwn: ReadableStream<string> = adopt(readable);

// The chunk types are inferred, not `any`.
// @ts-expect-error
const wrongReadable: ReadableStream<number> = adopt(nativeReadable);
// @ts-expect-error
const wrongWritable: WritableStream<number> = adopt(nativeWritable);
// @ts-expect-error
const wrongTransform: TransformStream<number, Uint8Array> = adopt(nativeTransform);
// @ts-expect-error
adopt({});
