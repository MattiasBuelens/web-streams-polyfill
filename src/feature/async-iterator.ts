import { convertIteratorOptions } from '../lib/validators/iterator-options';
import { typeIsObject } from '../lib/helpers/miscellaneous';
import { promiseRejectedWith, promiseResolvedWith, reflectCall, transformPromiseWith } from '../lib/helpers/webidl';
import { defineMethod, getGlobals, type StreamClasses } from './types';

/**
 * Adds async iteration to `ReadableStream`: `values()` and `[Symbol.asyncIterator]()`.
 *
 * @public
 */
export const name = 'async-iterator';

/**
 * Checks whether `ReadableStream.prototype.values()` and `ReadableStream.prototype[Symbol.asyncIterator]()` exist.
 *
 * @public
 */
export function check(classes: StreamClasses = getGlobals()): boolean {
  const proto = classes.ReadableStream?.prototype;
  return typeof proto?.values === 'function'
    && typeof proto[Symbol.asyncIterator] === 'function';
}

type ReadResult = { done: false; value: any } | { done: true; value: undefined };
type IterResult = { value: any; done: boolean };

interface ReaderMethods {
  read: (this: ReadableStreamDefaultReader) => Promise<ReadResult>;
  releaseLock: (this: ReadableStreamDefaultReader) => void;
  cancel: (this: ReadableStreamDefaultReader, reason: any) => Promise<void>;
}

/**
 * Installs `values()` and `[Symbol.asyncIterator]()` on `ReadableStream.prototype` if {@link check} fails.
 * Returns `true` if they were installed.
 *
 * @public
 */
export function install(classes: StreamClasses = getGlobals()): boolean {
  if (check(classes)) {
    return false;
  }
  const ReadableStream = classes.ReadableStream;
  if (typeof ReadableStream !== 'function') {
    throw new TypeError('ReadableStream is not available');
  }
  const streamProto = ReadableStream.prototype;

  // Capture the methods now, so patching them later doesn't affect our iterators.
  const getReader: (this: ReadableStream) => ReadableStreamDefaultReader = streamProto.getReader;
  const readerProto = Object.getPrototypeOf(reflectCall(getReader, new ReadableStream(), []));
  const reader: ReaderMethods = {
    read: readerProto.read,
    releaseLock: readerProto.releaseLock,
    cancel: readerProto.cancel
  };
  const iteratorPrototype = createIteratorPrototype();

  const { values } = {
    values(this: ReadableStream, options: unknown = undefined) {
      const { preventCancel } = convertIteratorOptions(options as any, 'First parameter');
      // This also checks that `this` is a ReadableStream, and that it's not locked.
      const streamReader = reflectCall(getReader, this, []);
      const iterator = Object.create(iteratorPrototype);
      iterators.set(iterator, new AsyncIteratorState(streamReader, preventCancel, reader));
      return iterator;
    }
  };
  defineMethod(streamProto, 'values', values);
  defineMethod(streamProto, Symbol.asyncIterator, values);
  return true;
}

// https://tc39.es/ecma262/#sec-asynciteratorprototype
// Feature modules only run in engines with native streams, which all support async generators.
const AsyncIteratorPrototype: object = Object.getPrototypeOf(Object.getPrototypeOf(async function* () {}).prototype);

const iterators = new WeakMap<object, AsyncIteratorState>();

function createIteratorPrototype(): object {
  const { next, return: return_ } = {
    next(this: unknown): Promise<IterResult> {
      const state = typeIsObject(this) ? iterators.get(this) : undefined;
      if (state === undefined) {
        return promiseRejectedWith(new TypeError('next() called on an object that is not a ReadableStream async iterator'));
      }
      return state.next();
    },
    return(this: unknown, value: any): Promise<IterResult> {
      const state = typeIsObject(this) ? iterators.get(this) : undefined;
      if (state === undefined) {
        return promiseRejectedWith(new TypeError('return() called on an object that is not a ReadableStream async iterator'));
      }
      return state.return(value);
    }
  };
  const proto = Object.create(AsyncIteratorPrototype);
  defineMethod(proto, 'next', next);
  defineMethod(proto, 'return', return_);
  return proto;
}

/**
 * The state of a ReadableStream async iterator, following the WebIDL asynchronous iterator steps
 * and the streams "get the next iteration result" and "asynchronous iterator return" steps,
 * using the public reader methods.
 */
class AsyncIteratorState {
  private readonly _reader: ReadableStreamDefaultReader;
  private readonly _preventCancel: boolean;
  private readonly _methods: ReaderMethods;
  private _ongoingPromise: Promise<IterResult> | undefined = undefined;
  private _isFinished = false;
  private readonly _nextSteps: () => Promise<IterResult>;
  private readonly _onReadResult: (result: ReadResult) => IterResult;
  private readonly _onReadError: (reason: any) => never;

  constructor(reader: ReadableStreamDefaultReader, preventCancel: boolean, methods: ReaderMethods) {
    this._reader = reader;
    this._preventCancel = preventCancel;
    this._methods = methods;
    this._nextSteps = () => this._doNextSteps();
    this._onReadResult = (result) => {
      this._ongoingPromise = undefined;
      if (result.done) {
        this._isFinished = true;
        reflectCall(this._methods.releaseLock, this._reader, []);
        return { value: undefined, done: true };
      }
      return { value: result.value, done: false };
    };
    this._onReadError = (reason) => {
      this._ongoingPromise = undefined;
      this._isFinished = true;
      reflectCall(this._methods.releaseLock, this._reader, []);
      throw reason;
    };
  }

  next(): Promise<IterResult> {
    this._ongoingPromise = this._ongoingPromise !== undefined
      ? transformPromiseWith(this._ongoingPromise, this._nextSteps, this._nextSteps)
      : this._nextSteps();
    return this._ongoingPromise;
  }

  return(value: any): Promise<IterResult> {
    const returnSteps = () => this._returnSteps(value);
    this._ongoingPromise = this._ongoingPromise !== undefined
      ? transformPromiseWith(this._ongoingPromise, returnSteps, returnSteps)
      : returnSteps();
    return transformPromiseWith(this._ongoingPromise, () => ({ value, done: true }));
  }

  private _doNextSteps(): Promise<IterResult> {
    if (this._isFinished) {
      return promiseResolvedWith({ value: undefined, done: true });
    }
    const readPromise = reflectCall(this._methods.read, this._reader, []);
    return transformPromiseWith(readPromise, this._onReadResult, this._onReadError);
  }

  private _returnSteps(value: any): Promise<IterResult> {
    if (this._isFinished) {
      return promiseResolvedWith({ value, done: true });
    }
    this._isFinished = true;
    if (!this._preventCancel) {
      const cancelPromise = reflectCall(this._methods.cancel, this._reader, [value]);
      reflectCall(this._methods.releaseLock, this._reader, []);
      return transformPromiseWith(cancelPromise, () => ({ value, done: true }));
    }
    reflectCall(this._methods.releaseLock, this._reader, []);
    return promiseResolvedWith({ value, done: true });
  }
}
