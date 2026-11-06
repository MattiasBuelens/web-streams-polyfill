// Helpers to test the feature modules on engines that already implement those features natively.
// These run in the test page (browsers) or the test worker (Node.js), right before and after installAll().

/**
 * Removes or hides the native features, so that installAll() installs all of them.
 */
export function hideNativeFeatures(global) {
  delete global.ReadableStream.from;
  delete global.ReadableStream.prototype.values;
  delete global.ReadableStream.prototype[Symbol.asyncIterator];

  // Ignore the options of ReadableStreamBYOBReader.prototype.read(view, { min }).
  const byobReaderPrototype = Object.getPrototypeOf(new global.ReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' }));
  const nativeRead = byobReaderPrototype.read;
  Object.defineProperty(byobReaderPrototype, 'read', {
    value: {
      read(view) {
        return nativeRead.call(this, view);
      }
    }.read
  });

  // We can't remove native support for transformer.cancel(), so hide the cancel() method from the native constructor.
  const NativeTransformStream = global.TransformStream;
  global.TransformStream = new Proxy(NativeTransformStream, {
    construct(target, args, newTarget) {
      const [transformer] = args;
      if (transformer !== null && typeof transformer === 'object' && 'cancel' in transformer) {
        const { cancel: _cancel, ...withoutCancel } = transformer;
        args = [withoutCancel, ...args.slice(1)];
      }
      return Reflect.construct(target, args, newTarget === global.TransformStream ? target : newTarget);
    }
  });
}

/**
 * Makes every TransformStream use our implementation on top of native streams,
 * instead of only those with a transformer.cancel() method.
 * A transformer without cancel() is wrapped in one that has a no-op cancel(), which behaves the same.
 */
export function forceOwnTransformStream(global) {
  const TransformStream = global.TransformStream;
  const proxy = new Proxy(TransformStream, {
    construct(target, args, newTarget) {
      const [transformer] = args;
      if (transformer === undefined || transformer === null
        || (typeof transformer === 'object' && transformer.cancel === undefined)) {
        const wrapped = new Proxy(transformer ?? {}, {
          get(t, key, receiver) {
            if (key === 'cancel') {
              return noopCancel;
            }
            return Reflect.get(t, key, receiver);
          }
        });
        args = [wrapped, ...args.slice(1)];
      }
      return Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
    }
  });
  Object.defineProperty(TransformStream.prototype, 'constructor', { value: proxy });
  global.TransformStream = proxy;
}

function noopCancel() {}

/**
 * Makes the native ReadableStream behave like one without byte streams (e.g. Safari before 26.4):
 * the constructor rejects `type: 'bytes'`, `getReader({ mode: 'byob' })` throws,
 * and the byte stream classes are removed from the global object.
 * Streams created by the platform (e.g. `Response.body`) can still be native byte streams,
 * but they can't be read with a BYOB reader either.
 */
export function hideByteStreams(global) {
  const NativeReadableStream = global.ReadableStream;
  const prototype = NativeReadableStream.prototype;
  const ReadableStream = {
    ReadableStream: function (source = undefined, strategy = undefined) {
      if (new.target === undefined) {
        throw new TypeError('Constructor ReadableStream requires \'new\'');
      }
      if (source !== null && typeof source === 'object' && source.type === 'bytes') {
        throw new RangeError('Byte streams are not supported');
      }
      return Reflect.construct(NativeReadableStream, [source, strategy], new.target);
    }
  }.ReadableStream;
  Object.setPrototypeOf(ReadableStream, Object.getPrototypeOf(NativeReadableStream));
  for (const key of Reflect.ownKeys(NativeReadableStream)) {
    if (key !== 'prototype' && key !== 'name' && key !== 'length') {
      Object.defineProperty(ReadableStream, key, Object.getOwnPropertyDescriptor(NativeReadableStream, key));
    }
  }
  Object.defineProperty(ReadableStream, 'prototype', { value: prototype, writable: false });
  Object.defineProperty(prototype, 'constructor', { value: ReadableStream, writable: true, configurable: true });

  const nativeGetReader = prototype.getReader;
  Object.defineProperty(prototype, 'getReader', {
    value: {
      getReader(options = undefined) {
        if (options !== undefined && options !== null && options.mode !== undefined) {
          throw new TypeError('Unsupported reader mode');
        }
        return nativeGetReader.call(this);
      }
    }.getReader,
    writable: true,
    enumerable: true,
    configurable: true
  });

  global.ReadableStream = ReadableStream;
  delete global.ReadableByteStreamController;
  delete global.ReadableStreamBYOBReader;
  delete global.ReadableStreamBYOBRequest;
}
