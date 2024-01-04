import NumberIsNaN from '../../stub/number-isnan';
import { ArrayBufferSlice } from './ecmascript';
import type { NonShared } from '../helpers/array-buffer-view';

export function IsNonNegativeNumber(v: number): boolean {
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
}

export function CloneAsUint8Array(O: NonShared<ArrayBufferView>): NonShared<Uint8Array> {
  const buffer = ArrayBufferSlice(O.buffer, O.byteOffset, O.byteOffset + O.byteLength);
  return new Uint8Array(buffer) as NonShared<Uint8Array>;
}
