// Helpers to test the feature modules on engines that already implement those features natively.
// These run in the test page (browsers) or the test worker (Node.js), right before and after installAll().

/**
 * Removes or hides the native features, so that installAll() installs all of them.
 */
export function hideNativeFeatures(global) {
  delete global.ReadableStream.from;
  delete global.ReadableStream.prototype.values;
  delete global.ReadableStream.prototype[Symbol.asyncIterator];

  // We can't remove native support for transformer.cancel(), so hide the cancel() method from the native constructor.
  const NativeTransformStream = global.TransformStream;
  global.TransformStream = new Proxy(NativeTransformStream, {
    construct(target, args, newTarget) {
      const [transformer] = args;
      if (transformer !== null && typeof transformer === 'object' && 'cancel' in transformer) {
        const { cancel, ...withoutCancel } = transformer;
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
