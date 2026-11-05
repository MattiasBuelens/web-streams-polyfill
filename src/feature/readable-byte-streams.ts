import {
  InitializeReadableStream,
  ReadableStream as OwnReadableStream,
  ReadableStreamCancel,
  type ReadableByteStream
} from '../lib/readable-stream';
import {
  ReadableByteStreamController,
  ReadableStreamBYOBRequest,
  SetUpReadableByteStreamControllerFromUnderlyingSource
} from '../lib/readable-stream/byte-stream-controller';
import { ReadableStreamBYOBReader as OwnReadableStreamBYOBReader } from '../lib/readable-stream/byob-reader';
import {
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamDefaultReaderRelease,
  type ReadableStreamDefaultReader as OwnReadableStreamDefaultReader
} from '../lib/readable-stream/default-reader';
import { readerSetStateChangeListener } from '../lib/readable-stream/generic-reader';
import { ReadableByteStreamTee } from '../lib/readable-stream/tee';
import type { ValidatedUnderlyingByteSource } from '../lib/readable-stream/underlying-source';
import { ExtractHighWaterMark } from '../lib/abstract-ops/queuing-strategy';
import { setFunctionName, typeIsObject } from '../lib/helpers/miscellaneous';
import { promiseRejectedWith, promiseResolvedWith, reflectCall } from '../lib/helpers/webidl';
import { assertDictionary, assertObject, assertRequiredArgument } from '../lib/validators/basic';
import { convertQueuingStrategy } from '../lib/validators/queuing-strategy';
import { convertReaderOptions } from '../lib/validators/reader-options';
import { convertUnderlyingDefaultOrByteSource } from '../lib/validators/underlying-source';
import { bindMethods, defineClass, fixConstructor, getPropertyDescriptor, readMembers, replaceMethod } from './patch';
import { defineMethod, getGlobals, type StreamClasses } from './types';

/**
 * Adds readable byte streams (`new ReadableStream({ type: 'bytes' })`) and BYOB readers.
 *
 * @public
 */
export const name = 'readable-byte-streams';

/**
 * Checks whether `ReadableStream` supports byte streams and BYOB readers.
 *
 * @public
 */
export function check(classes: StreamClasses = getGlobals()): boolean {
  const ReadableStream = classes.ReadableStream;
  if (typeof ReadableStream !== 'function') {
    return false;
  }
  try {
    new ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs byte streams if {@link check} fails.
 * Returns `true` if it was installed.
 *
 * `ReadableStream` is replaced by a constructor that shares the native prototype.
 * A stream with a default source is still a native `ReadableStream`.
 * A byte stream is a native `ReadableStream` too, but its chunks come from this library's own byte stream,
 * which runs the underlying byte source. `getReader({ mode: 'byob' })` returns a BYOB reader for that byte stream,
 * and `tee()` tees it into two byte streams.
 * This also installs `ReadableByteStreamController`, `ReadableStreamBYOBReader` and `ReadableStreamBYOBRequest`.
 *
 * @public
 */
export function install(classes: StreamClasses = getGlobals()): boolean {
  if (check(classes)) {
    return false;
  }
  const NativeReadableStream = classes.ReadableStream;
  if (typeof NativeReadableStream !== 'function') {
    return false;
  }

  const streamPrototype = NativeReadableStream.prototype;
  const nativeGetReader: (this: any, options?: any) => any = streamPrototype.getReader;
  const nativeLocked = getPropertyDescriptor(streamPrototype, 'locked')!.get!;
  const nativeDefaultReaderPrototype = Object.getPrototypeOf(reflectCall(nativeGetReader, new NativeReadableStream(), []));
  const nativeRead: (this: any) => Promise<any> = nativeDefaultReaderPrototype.read;
  const nativeReleaseLock: (this: any) => void = nativeDefaultReaderPrototype.releaseLock;

  /**
   * A native default ReadableStream, which reads its chunks from our own byte stream.
   *
   * Our byte stream is always locked: by an internal default reader while the native stream is unlocked
   * (or locked by a native reader), or by a BYOB reader. In the latter case, the native stream is locked
   * by a native default reader that is never read from, so nobody else can read from it.
   */
  class ByteStreamAdapter {
    readonly _byteStream: ReadableByteStream;
    _nativeController: ReadableStreamDefaultController<Uint8Array> | undefined = undefined;
    _internalReader: OwnReadableStreamDefaultReader<Uint8Array> | undefined = undefined;
    _nativeReader: ReadableStreamDefaultReader | undefined = undefined;
    /** The number of pending reads on the native stream that we know of (from readers returned by getReader()). */
    _nativeReads = 0;
    /** The number of pending reads on our byte stream, made by _pull(). */
    _internalReads = 0;

    constructor(byteStream: ReadableByteStream) {
      this._byteStream = byteStream;
    }

    /**
     * Creates the native stream for this adapter, with the given `new.target`.
     */
    _createNativeStream(newTarget: any): ReadableStream<Uint8Array> {
      // Use objects without a prototype, so the dictionary conversions don't see inherited properties.
      const source = Object.create(null);
      source.start = (controller: ReadableStreamDefaultController<Uint8Array>) => {
        this._nativeController = controller;
      };
      source.pull = this._pull;
      source.cancel = (reason: any) => ReadableStreamCancel(this._byteStream, reason);
      const strategy = Object.create(null);
      strategy.highWaterMark = 0;
      const stream: ReadableStream<Uint8Array> = Reflect.construct(NativeReadableStream, [source, strategy], newTarget) as any;
      adapters.set(stream, this);
      this._acquireInternalReader();
      return stream;
    }

    _acquireInternalReader() {
      const reader = AcquireReadableStreamDefaultReader<Uint8Array>(this._byteStream);
      this._internalReader = reader;
      if (this._byteStream._state === 'readable') {
        readerSetStateChangeListener(reader, this._syncState);
      } else {
        this._syncState();
      }
    }

    _releaseInternalReader() {
      const reader = this._internalReader!;
      this._internalReader = undefined;
      // This rejects the pending reads from _pull(), which doesn't affect the native stream.
      ReadableStreamDefaultReaderRelease(reader);
    }

    /**
     * Cancels our pending reads on the byte stream, after the native reads that they were for were rejected.
     * Otherwise, their chunks would end up in the native stream's queue, where a BYOB reader can't read them.
     * Our byte stream keeps those chunks in its own queue instead, for the next reader.
     */
    _cancelInternalReads() {
      if (this._internalReads > 0 && this._internalReader !== undefined) {
        this._releaseInternalReader();
        this._acquireInternalReader();
      }
    }

    /**
     * Locks the native stream, and releases our byte stream, so it can be locked by a BYOB reader (or tee()).
     * Throws a TypeError if the native stream is locked.
     */
    _lockNative(stream: ReadableStream) {
      this._nativeReader = reflectCall(nativeGetReader, stream, []);
      this._releaseInternalReader();
    }

    _unlockNative() {
      reflectCall(nativeReleaseLock, this._nativeReader, []);
      this._nativeReader = undefined;
      this._acquireInternalReader();
    }

    /**
     * Closes or errors the native stream once our byte stream becomes closed or errored.
     */
    private readonly _syncState = () => {
      const controller = this._nativeController!;
      const byteStream = this._byteStream;
      if (byteStream._state === 'closed') {
        // Reading the last chunk closes our byte stream right before the read receives that chunk.
        // Close the native stream after enqueueing that chunk.
        if (this._internalReads > 0) {
          return;
        }
        try {
          controller.close();
        } catch {
          // The native stream was already closed or cancelled.
        }
      } else if (byteStream._state === 'errored') {
        controller.error(byteStream._storedError);
      }
    };

    /**
     * Makes as many reads on our byte stream as there are pending reads on the native stream (at least one).
     * The native stream calls this again whenever a read is added, so this can return immediately.
     */
    private readonly _pull = (): Promise<void> => {
      // The native stream only calls pull() when it has at least one pending read.
      this._pullInternal(1);
      return promiseResolvedWith(undefined);
    };

    /**
     * Makes as many reads on our byte stream as there are pending reads on the native stream that we know of
     * (but at least `minimum`).
     */
    _pullInternal(minimum: number) {
      const reader = this._internalReader;
      if (reader !== undefined) {
        // A read may be fulfilled synchronously from our queue, so count how many reads we make, not how many are pending.
        let needed = Math.max(minimum, this._nativeReads) - this._internalReads;
        while (needed > 0 && this._internalReader === reader && this._byteStream._state === 'readable') {
          needed--;
          this._internalReads++;
          ReadableStreamDefaultReaderRead(reader, {
            _chunkSteps: this._onChunk,
            _closeSteps: this._onDone,
            // Erroring is handled by _syncState.
            // A read can also fail because we released the internal reader, which doesn't affect the native stream.
            _errorSteps: this._onDone
          });
        }
      }
    }

    private readonly _onChunk = (chunk: Uint8Array) => {
      this._internalReads--;
      if (this._nativeReads > 0) {
        this._nativeReads--;
      }
      try {
        this._nativeController!.enqueue(chunk);
      } catch {
        // The native stream was already closed or cancelled.
      }
      if (this._byteStream._state === 'closed') {
        this._syncState();
      }
    };

    private readonly _onDone = () => {
      this._internalReads--;
      if (this._byteStream._state === 'closed') {
        this._syncState();
      }
    };
  }

  const adapters = new WeakMap<object, ByteStreamAdapter>();

  function createByteStream(byteStream: ReadableByteStream, newTarget: any): ReadableStream<Uint8Array> {
    return new ByteStreamAdapter(byteStream)._createNativeStream(newTarget);
  }

  const { ReadableStream } = {
    ReadableStream: function (this: any, rawUnderlyingSource: any = undefined, rawStrategy: any = undefined): any {
      if (new.target === undefined) {
        throw new TypeError('Constructor ReadableStream requires \'new\'');
      }
      if (rawUnderlyingSource === undefined) {
        rawUnderlyingSource = null;
      } else {
        assertObject(rawUnderlyingSource, 'First parameter');
      }
      // Read every member once, in the same order as the WebIDL dictionary conversions.
      assertDictionary(rawStrategy, 'Second parameter');
      const strategyMembers = readMembers(rawStrategy, ['highWaterMark', 'size']);
      assertDictionary(rawUnderlyingSource, 'First parameter');
      const sourceMembers = readMembers(rawUnderlyingSource, ['autoAllocateChunkSize', 'cancel', 'pull', 'start', 'type']);
      // Validate them. Call the source's methods on the original source object.
      const strategy = convertQueuingStrategy(strategyMembers, 'Second parameter');
      const boundSource = bindMethods(sourceMembers, rawUnderlyingSource, ['cancel', 'pull', 'start']);
      const underlyingSource = convertUnderlyingDefaultOrByteSource(boundSource, 'First parameter');
      if (underlyingSource.type !== 'bytes') {
        // Hand off to the native constructor, without reading the source's or strategy's members again.
        // Only pass the methods: the native constructor would convert `autoAllocateChunkSize` a second time.
        // (It's ignored for a default source, but converting it calls its valueOf() method.)
        // Pass the raw methods, not the converted ones, since those would add extra promise ticks.
        const nativeSource = readMembers(boundSource, ['cancel', 'pull', 'start']);
        const nativeStrategy = Object.create(null);
        if (strategy.highWaterMark !== undefined) {
          nativeStrategy.highWaterMark = strategy.highWaterMark;
        }
        if (strategyMembers.size !== undefined) {
          nativeStrategy.size = strategyMembers.size;
        }
        return Reflect.construct(NativeReadableStream, [nativeSource, nativeStrategy], new.target);
      }
      if (strategy.size !== undefined) {
        throw new RangeError('The strategy for a byte stream cannot have a size function');
      }
      const highWaterMark = ExtractHighWaterMark(strategy, 0);
      const byteStream: ReadableByteStream = Object.create(OwnReadableStream.prototype);
      InitializeReadableStream(byteStream);
      SetUpReadableByteStreamControllerFromUnderlyingSource(
        byteStream,
        underlyingSource as ValidatedUnderlyingByteSource,
        highWaterMark
      );
      return createByteStream(byteStream, new.target);
    }
  };
  setFunctionName(ReadableStream, 'ReadableStream');
  // Keep the static methods (such as from()), and the native class's own prototype chain.
  Object.setPrototypeOf(ReadableStream, Object.getPrototypeOf(NativeReadableStream));
  for (const key of Reflect.ownKeys(NativeReadableStream)) {
    if (key !== 'prototype' && key !== 'name' && key !== 'length') {
      Object.defineProperty(ReadableStream, key, Object.getOwnPropertyDescriptor(NativeReadableStream, key)!);
    }
  }
  Object.defineProperty(ReadableStream, 'prototype', { value: streamPrototype, writable: false });
  Object.defineProperty(streamPrototype, 'constructor', {
    ...Object.getOwnPropertyDescriptor(streamPrototype, 'constructor'),
    value: ReadableStream
  });

  const ownReaderPrototype = OwnReadableStreamBYOBReader.prototype;
  const ownClosed = getPropertyDescriptor(ownReaderPrototype, 'closed')!.get!;
  const readerStates = new WeakMap<object, { reader: OwnReadableStreamBYOBReader; adapter: ByteStreamAdapter }>();
  const getReaderState = (reader: unknown, method: string) => {
    const state = typeIsObject(reader) ? readerStates.get(reader) : undefined;
    if (state === undefined) {
      throw new TypeError(`ReadableStreamBYOBReader.prototype.${method} can only be used on a ReadableStreamBYOBReader`);
    }
    return state;
  };

  /**
   * A BYOB reader for one of our byte streams. It wraps a BYOB reader of our own byte stream,
   * and keeps the native stream locked while it's active.
   */
  class ReadableStreamBYOBReader {
    constructor(stream: ReadableStream<Uint8Array>) {
      assertRequiredArgument(stream, 1, 'ReadableStreamBYOBReader');
      // Brand check
      reflectCall(nativeLocked, stream, []);
      const adapter = adapters.get(stream);
      if (adapter === undefined) {
        throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source');
      }
      adapter._lockNative(stream);
      const reader = new OwnReadableStreamBYOBReader(adapter._byteStream);
      readerStates.set(this, { reader, adapter });
    }

    get closed(): Promise<undefined> {
      let state;
      try {
        state = getReaderState(this, 'closed');
      } catch (e) {
        return promiseRejectedWith(e);
      }
      return reflectCall(ownClosed, state.reader, []);
    }

    cancel(reason: any = undefined): Promise<void> {
      let state;
      try {
        state = getReaderState(this, 'cancel');
      } catch (e) {
        return promiseRejectedWith(e);
      }
      return reflectCall(ownReaderPrototype.cancel, state.reader, [reason]);
    }

    read(view: ArrayBufferView, options: any = {}): Promise<any> {
      let state;
      try {
        state = getReaderState(this, 'read');
      } catch (e) {
        return promiseRejectedWith(e);
      }
      return reflectCall(ownReaderPrototype.read as any, state.reader, [view, options]);
    }

    releaseLock(): void {
      const { reader, adapter } = getReaderState(this, 'releaseLock');
      const wasLocked = reader._ownerReadableStream !== undefined;
      reflectCall(ownReaderPrototype.releaseLock, reader, []);
      if (wasLocked) {
        adapter._unlockNative();
      }
    }
  }
  Object.defineProperties(ReadableStreamBYOBReader.prototype, {
    cancel: { enumerable: true },
    read: { enumerable: true },
    releaseLock: { enumerable: true },
    closed: { enumerable: true },
    [Symbol.toStringTag]: { value: 'ReadableStreamBYOBReader', configurable: true }
  });
  setFunctionName(ReadableStreamBYOBReader as any, 'ReadableStreamBYOBReader');

  // Default readers of our byte streams count their pending reads, so _pull() can make as many reads on our byte stream.
  // (Readers that the native implementation acquires itself, e.g. for pipeTo(), are not counted.
  // Then we only make one read at a time, which is enough for them.)
  const countingReaderPrototype = Object.create(nativeDefaultReaderPrototype);
  const readerAdapters = new WeakMap<object, ByteStreamAdapter>();
  defineMethod(countingReaderPrototype, 'read', {
    read(this: ReadableStreamDefaultReader) {
      const adapter = readerAdapters.get(this);
      if (adapter === undefined || adapter._nativeReader !== undefined) {
        return reflectCall(nativeRead, this, []);
      }
      adapter._nativeReads++;
      const promise = reflectCall(nativeRead, this, []);
      // Forward the read to our byte stream right away, like a read on a native byte stream would.
      // (The native stream only calls pull() after start() has finished, and only one at a time.)
      adapter._pullInternal(0);
      return promise;
    }
  }.read);
  defineMethod(countingReaderPrototype, 'releaseLock', {
    releaseLock(this: ReadableStreamDefaultReader) {
      reflectCall(nativeReleaseLock, this, []);
      // This rejects all pending reads.
      // (Older engines throw instead if there are pending reads, in which case we keep counting them.)
      const adapter = readerAdapters.get(this);
      if (adapter !== undefined) {
        adapter._nativeReads = 0;
        readerAdapters.delete(this);
        adapter._cancelInternalReads();
      }
    }
  }.releaseLock);

  const nativeTee: (this: any) => [any, any] = streamPrototype.tee;
  const { tee } = {
    tee(this: ReadableStream<Uint8Array>): [any, any] {
      const adapter = typeIsObject(this) ? adapters.get(this) : undefined;
      if (adapter === undefined) {
        const branches = reflectCall(nativeTee, this, []);
        fixConstructor(branches[0], NativeReadableStream, ReadableStream);
        fixConstructor(branches[1], NativeReadableStream, ReadableStream);
        return branches;
      }
      // Lock the native stream forever, and tee our byte stream into two new byte streams.
      adapter._lockNative(this);
      const [branch1, branch2] = ReadableByteStreamTee(adapter._byteStream);
      return [createByteStream(branch1, NativeReadableStream), createByteStream(branch2, NativeReadableStream)];
    }
  };
  replaceMethod(streamPrototype, 'tee', tee);
  const { getReader } = {
    getReader(this: ReadableStream, rawOptions: any = undefined): any {
      // Brand check
      reflectCall(nativeLocked, this, []);
      const options = convertReaderOptions(rawOptions, 'First parameter');
      if (options.mode === 'byob') {
        // ReadableStreamBYOBReader's constructor throws if this is not a byte stream.
        return new ReadableStreamBYOBReader(this);
      }
      const reader = reflectCall(nativeGetReader, this, []);
      const adapter = adapters.get(this);
      if (adapter !== undefined) {
        Object.setPrototypeOf(reader, countingReaderPrototype);
        readerAdapters.set(reader, adapter);
      }
      return reader;
    }
  };
  replaceMethod(streamPrototype, 'getReader', getReader);

  defineClass(classes, 'ReadableStream', ReadableStream);
  defineClass(classes, 'ReadableByteStreamController', ReadableByteStreamController);
  defineClass(classes, 'ReadableStreamBYOBReader', ReadableStreamBYOBReader);
  defineClass(classes, 'ReadableStreamBYOBRequest', ReadableStreamBYOBRequest);
  return true;
}
