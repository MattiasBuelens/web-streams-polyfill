export {
  typeIsObject,
  createDataProperty,
  createArrayFromList,
  ArrayBufferCopy,
  IsFiniteNonNegativeNumber,
  IsNonNegativeNumber,
  Call,
  CreateAlgorithmFromUnderlyingMethod,
  InvokeOrNoop,
  PromiseCall,
  ValidateAndNormalizeHighWaterMark,
  MakeSizeAlgorithmFromSizeFunction,
  PerformPromiseThen,
  WaitForAll,
  WaitForAllPromise
} from '../../spec/reference-implementation/lib/helpers';

// Not implemented correctly
export function TransferArrayBuffer(O) {
  return O;
}

// Not implemented correctly
export function IsDetachedBuffer(O) { // eslint-disable-line no-unused-vars
  return false;
}
