import assert from '../stub/better-assert.js';
import NumberIsNaN from '../stub/number-isnan.js';

function IsPropertyKey(argument) {
  return typeof argument === 'string' || typeof argument === 'symbol';
}

export const typeIsObject = x => (typeof x === 'object' && x !== null) || typeof x === 'function';

export const createDataProperty = (o, p, v) => {
  assert(typeIsObject(o));
  Object.defineProperty(o, p, { value: v, writable: true, enumerable: true, configurable: true });
};

export const createArrayFromList = elements => {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice();
};

export const ArrayBufferCopy = (dest, destOffset, src, srcOffset, n) => {
  new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
};

export const IsFiniteNonNegativeNumber = v => {
  if (IsNonNegativeNumber(v) === false) {
    return false;
  }

  if (v === Infinity) {
    return false;
  }

  return true;
};

export const IsNonNegativeNumber = v => {
  if (typeof v !== 'number') {
    return false;
  }

  if (NumberIsNaN(v)) {
    return false;
  }

  if (v < 0) {
    return false;
  }

  return true;
};

export function Call(F, V, args) {
  if (typeof F !== 'function') {
    throw new TypeError('Argument is not a function');
  }

  return Function.prototype.apply.call(F, V, args);
}

export const CreateAlgorithmFromUnderlyingMethod = (underlyingObject, methodName, algoArgCount, extraArgs) => {
  assert(underlyingObject !== undefined);
  assert(IsPropertyKey(methodName));
  assert(algoArgCount === 0 || algoArgCount === 1);
  assert(Array.isArray(extraArgs));
  const method = underlyingObject[methodName];
  if (method !== undefined) {
    if (typeof method !== 'function') {
      throw new TypeError(`${method} is not a method`);
    }
    switch (algoArgCount) {
      case 0: {
        return () => {
          return PromiseCall(method, underlyingObject, extraArgs);
        };
      }

      case 1: {
        return arg => {
          const fullArgs = [arg].concat(extraArgs);
          return PromiseCall(method, underlyingObject, fullArgs);
        };
      }
    }
  }
  return () => Promise.resolve();
};

export const InvokeOrNoop = (O, P, args) => {
  assert(O !== undefined);
  assert(IsPropertyKey(P));
  assert(Array.isArray(args));

  const method = O[P];
  if (method === undefined) {
    return undefined;
  }

  return Call(method, O, args);
};

export function PromiseCall(F, V, args) {
  assert(typeof F === 'function');
  assert(V !== undefined);
  assert(Array.isArray(args));
  try {
    return Promise.resolve(Call(F, V, args));
  } catch (value) {
    return Promise.reject(value);
  }
}

// Not implemented correctly
export const TransferArrayBuffer = O => {
  return O;
};

// Not implemented correctly
export const IsDetachedBuffer = O => { // eslint-disable-line no-unused-vars
  return false;
};

export const ValidateAndNormalizeHighWaterMark = highWaterMark => {
  highWaterMark = Number(highWaterMark);
  if (NumberIsNaN(highWaterMark) || highWaterMark < 0) {
    throw new RangeError('highWaterMark property of a queuing strategy must be non-negative and non-NaN');
  }

  return highWaterMark;
};

export const MakeSizeAlgorithmFromSizeFunction = size => {
  if (size === undefined) {
    return () => 1;
  }
  if (typeof size !== 'function') {
    throw new TypeError('size property of a queuing strategy must be a function');
  }
  return chunk => size(chunk);
};

export const PerformPromiseThen = (promise, onFulfilled, onRejected) => {
  // There doesn't appear to be any way to correctly emulate the behaviour from JavaScript, so this is just an
  // approximation.
  return Promise.prototype.then.call(promise, onFulfilled, onRejected);
};

export const WaitForAll = (promises, successSteps, failureSteps) => {
  let rejected = false;
  const rejectionHandler = arg => {
    if (rejected === false) {
      rejected = true;
      failureSteps(arg);
    }
  };
  let index = 0;
  let fulfilledCount = 0;
  const total = promises.length;
  const result = new Array(total);
  for (const promise of promises) {
    const promiseIndex = index;
    const fulfillmentHandler = arg => {
      result[promiseIndex] = arg;
      ++fulfilledCount;
      if (fulfilledCount === total) {
        successSteps(result);
      }
    };
    PerformPromiseThen(promise, fulfillmentHandler, rejectionHandler);
    ++index;
  }
};

export const WaitForAllPromise = (promises, successSteps, failureSteps = undefined) => {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  if (failureSteps === undefined) {
    failureSteps = arg => {
      throw arg;
    };
  }
  const successStepsWrapper = results => {
    try {
      const stepsResult = successSteps(results);
      resolvePromise(stepsResult);
    } catch (e) {
      rejectPromise(e);
    }
  };
  const failureStepsWrapper = reason => {
    try {
      const stepsResult = failureSteps(reason);
      resolvePromise(stepsResult);
    } catch (e) {
      rejectPromise(e);
    }
  };
  WaitForAll(promises, successStepsWrapper, failureStepsWrapper);
  return promise;
};
