import { installAll } from '../feature/index';
import { defineMethod, type StreamClasses } from '../feature/types';
import { typeIsObject } from '../lib/helpers/miscellaneous';
import { reflectCall } from '../lib/helpers/webidl';

/**
 * The classes exported by `web-streams-polyfill/extend-native`, plus `adopt()`.
 */
export type ExtendNativeExports = Record<
  'ReadableStream'
  | 'ReadableStreamDefaultController'
  | 'ReadableByteStreamController'
  | 'ReadableStreamBYOBRequest'
  | 'ReadableStreamDefaultReader'
  | 'ReadableStreamBYOBReader'
  | 'WritableStream'
  | 'WritableStreamDefaultController'
  | 'WritableStreamDefaultWriter'
  | 'ByteLengthQueuingStrategy'
  | 'CountQueuingStrategy'
  | 'TransformStream'
  | 'TransformStreamDefaultController',
  any> & {
    adopt(stream: unknown): any;
  };

type Getter = (this: any) => any;

function getGetter(prototype: object | null, key: string): Getter {
  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor !== undefined) {
      return descriptor.get!;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  throw new TypeError(`Missing getter: ${key}`);
}

/**
 * Returns the class of an object, e.g. a native reader or controller.
 * (Some of these classes are not exposed on the global object in every environment.)
 */
function getClass(object: object): any {
  return Object.getPrototypeOf(object).constructor;
}

/**
 * Returns the prototype of the native BYOB reader, or `undefined` if the native implementation doesn't support byte streams.
 */
function getNativeBYOBReaderPrototype(NativeReadableStream: any, nativeGetReader: (this: any, options?: any) => any): any {
  try {
    return Object.getPrototypeOf(reflectCall(nativeGetReader, new NativeReadableStream({ type: 'bytes' }), [{ mode: 'byob' }]));
  } catch {
    return undefined;
  }
}

/**
 * Returns the class of the controller that a stream class passes to `start()`.
 */
function getControllerClass(StreamClass: any, underlyingObject: object): any {
  let controller: any;
  new StreamClass({
    ...underlyingObject,
    start(c: any) {
      controller = c;
    }
  });
  return getClass(controller);
}

/**
 * Checks whether `getter` accepts `x` as its receiver, i.e. whether `x` has the internal slots of its class.
 */
function hasBrand(getter: Getter, x: unknown): boolean {
  if (!typeIsObject(x)) {
    return false;
  }
  try {
    reflectCall(getter, x, []);
    return true;
  } catch {
    return false;
  }
}

/**
 * Changes the class of a native object to our subclass,
 * but only if our subclass inherits from its current class, so that the object keeps all of its members.
 * Instances of other subclasses (e.g. a `FileSystemWritableFileStream`, or a user-defined subclass)
 * keep their own prototype, since replacing it would lose that subclass's members.
 */
function setClass(object: any, NativeClass: any, Subclass: any) {
  if (!Object.prototype.isPrototypeOf.call(Object.getPrototypeOf(object), Subclass.prototype)) {
    return;
  }
  Object.setPrototypeOf(object, Subclass.prototype);
  // Node.js defines an own `constructor` property on streams that it creates internally (e.g. the branches of `tee()`).
  const descriptor = Object.getOwnPropertyDescriptor(object, 'constructor');
  if (descriptor !== undefined && descriptor.value === NativeClass && descriptor.configurable) {
    Object.defineProperty(object, 'constructor', { ...descriptor, value: Subclass });
  }
}

/**
 * Defines the members of a native prototype on our subclass's prototype too, unless we override them,
 * so that the subclass prototype looks like a WebIDL interface prototype object.
 * (For example, `Object.getOwnPropertyDescriptor(ReadableStream.prototype, 'locked').get` works.)
 */
function copyMembers(target: object, nativePrototype: object) {
  for (const key of Reflect.ownKeys(nativePrototype)) {
    if (key !== 'constructor' && !Object.prototype.hasOwnProperty.call(target, key)) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(nativePrototype, key)!);
    }
  }
}

/**
 * Creates subclasses of the native stream classes of `global`, and installs the missing features on those subclasses.
 * The native classes and their prototypes are left untouched.
 *
 * Streams created by the platform are instances of the native classes, not of our subclasses.
 * Our subclasses convert the streams that their own methods return (e.g. the branches of `tee()`),
 * and `adopt()` converts any other native stream.
 * The subclasses can't keep any state of their own, since adopted streams never run their constructor.
 */
export function createSubclasses(global: any): ExtendNativeExports {
  const NativeReadableStream = global.ReadableStream;
  const NativeWritableStream = global.WritableStream;
  const NativeTransformStream = global.TransformStream;

  // Capture the native methods first, so that patching them later doesn't affect us.
  const nativeReadableProto = NativeReadableStream.prototype;
  const nativeGetReader: (this: any, options?: any) => any = nativeReadableProto.getReader;
  const nativeTee: (this: any) => [any, any] = nativeReadableProto.tee;
  const nativePipeThrough: (this: any, transform: any, options?: any) => any = nativeReadableProto.pipeThrough;
  const nativeReadableLocked = getGetter(nativeReadableProto, 'locked');
  const nativeWritableLocked = getGetter(NativeWritableStream.prototype, 'locked');
  const nativeTransformReadable = getGetter(NativeTransformStream.prototype, 'readable');
  const nativeTransformWritable = getGetter(NativeTransformStream.prototype, 'writable');

  // If the native implementation doesn't support byte streams, the `readable-byte-streams` feature installs them.
  const nativeByobReaderProto = getNativeBYOBReaderPrototype(NativeReadableStream, nativeGetReader);
  const NativeTransformStreamDefaultController = getControllerClass(NativeTransformStream, {});

  let ReadableStreamBYOBReader: any;
  if (nativeByobReaderProto !== undefined) {
    const NativeReadableStreamBYOBReader = nativeByobReaderProto.constructor;
    // A class expression gets its name from the variable it's assigned to.
    ReadableStreamBYOBReader = class extends NativeReadableStreamBYOBReader {
      // Not useless: this gives the constructor a length of 1, like the native one.
      // eslint-disable-next-line @typescript-eslint/no-useless-constructor
      constructor(stream: any) {
        super(stream);
      }
    };
    copyMembers(ReadableStreamBYOBReader.prototype, NativeReadableStreamBYOBReader.prototype);
  }

  class ReadableStream extends NativeReadableStream {
    getReader(options: any = undefined): any {
      const reader = reflectCall(nativeGetReader, this, [options]);
      if (nativeByobReaderProto !== undefined && Object.getPrototypeOf(reader) === nativeByobReaderProto) {
        Object.setPrototypeOf(reader, ReadableStreamBYOBReader.prototype);
      }
      return reader;
    }

    tee(): [any, any] {
      const branches = reflectCall(nativeTee, this, []);
      adoptReadable(branches[0]);
      adoptReadable(branches[1]);
      return branches;
    }

    pipeThrough(transform: any, options: any = undefined): any {
      // This returns `transform.readable`, which may be a native stream (e.g. from a `CompressionStream`).
      return adoptReadable(reflectCall(nativePipeThrough, this, [transform, options]));
    }
  }

  // WebIDL operations are enumerable, unlike class methods.
  for (const key of ['getReader', 'tee', 'pipeThrough']) {
    Object.defineProperty(ReadableStream.prototype, key, { enumerable: true });
  }

  class WritableStream extends NativeWritableStream {}

  class TransformStream extends NativeTransformStream {
    constructor(transformer: any = undefined, writableStrategy: any = undefined, readableStrategy: any = undefined) {
      super(transformer, writableStrategy, readableStrategy);
      adoptReadable(reflectCall(nativeTransformReadable, this, []));
      adoptWritable(reflectCall(nativeTransformWritable, this, []));
    }
  }

  copyMembers(ReadableStream.prototype, nativeReadableProto);
  copyMembers(WritableStream.prototype, NativeWritableStream.prototype);
  copyMembers(TransformStream.prototype, NativeTransformStream.prototype);

  // Our controllers for `transformer-cancel` get their own prototype, so we don't need to patch the native one.
  // They are still instances of the native controller class.
  class TransformStreamDefaultControllerForFeatures extends NativeTransformStreamDefaultController {}

  const classes: StreamClasses = {
    ReadableStream,
    WritableStream,
    TransformStream,
    TransformStreamDefaultController: TransformStreamDefaultControllerForFeatures
  };
  installAll(classes);
  // `readable-byte-streams` and `transformer-cancel` replace the ReadableStream and TransformStream classes,
  // but keep our prototypes.
  const InstalledReadableStream = classes.ReadableStream;
  const InstalledTransformStream = classes.TransformStream;

  // A native ReadableStream.from() returns a native stream.
  // (If the native one is missing, `readable-stream-from` defines its own, which constructs our subclass.)
  if (!Object.prototype.hasOwnProperty.call(InstalledReadableStream, 'from') && typeof NativeReadableStream.from === 'function') {
    const nativeFrom = NativeReadableStream.from;
    const { from } = {
      from(asyncIterable: unknown): any {
        return adoptReadable(reflectCall(nativeFrom, NativeReadableStream, [asyncIterable]));
      }
    };
    defineMethod(InstalledReadableStream, 'from', from);
  }

  function adoptReadable(stream: any): any {
    if (!(stream instanceof ReadableStream) && hasBrand(nativeReadableLocked, stream)) {
      setClass(stream, NativeReadableStream, ReadableStream);
    }
    return stream;
  }

  function adoptWritable(stream: any): any {
    if (!(stream instanceof WritableStream) && hasBrand(nativeWritableLocked, stream)) {
      setClass(stream, NativeWritableStream, WritableStream);
    }
    return stream;
  }

  function adopt(stream: unknown): any {
    if (stream instanceof ReadableStream || stream instanceof WritableStream || stream instanceof InstalledTransformStream) {
      return stream;
    }
    if (hasBrand(nativeReadableLocked, stream)) {
      return adoptReadable(stream);
    }
    if (hasBrand(nativeWritableLocked, stream)) {
      return adoptWritable(stream);
    }
    if (hasBrand(nativeTransformReadable, stream)) {
      setClass(stream, NativeTransformStream, TransformStream);
      adoptReadable(reflectCall(nativeTransformReadable, stream, []));
      adoptWritable(reflectCall(nativeTransformWritable, stream, []));
      return stream;
    }
    throw new TypeError('adopt() expects a ReadableStream, WritableStream or TransformStream');
  }

  return {
    ReadableStream: InstalledReadableStream,
    ReadableStreamDefaultController: getControllerClass(NativeReadableStream, {}),
    ReadableByteStreamController: nativeByobReaderProto !== undefined
      ? getControllerClass(NativeReadableStream, { type: 'bytes' })
      : classes.ReadableByteStreamController,
    ReadableStreamBYOBRequest: nativeByobReaderProto !== undefined
      ? global.ReadableStreamBYOBRequest
      : classes.ReadableStreamBYOBRequest,
    ReadableStreamDefaultReader: getClass(reflectCall(nativeGetReader, new NativeReadableStream(), [])),
    ReadableStreamBYOBReader: ReadableStreamBYOBReader ?? classes.ReadableStreamBYOBReader,
    WritableStream,
    WritableStreamDefaultController: getControllerClass(NativeWritableStream, {}),
    WritableStreamDefaultWriter: getClass(new NativeWritableStream().getWriter()),
    ByteLengthQueuingStrategy: global.ByteLengthQueuingStrategy,
    CountQueuingStrategy: global.CountQueuingStrategy,
    TransformStream: InstalledTransformStream,
    TransformStreamDefaultController: NativeTransformStreamDefaultController,
    adopt
  };
}
