import NumberIsNaN from '../../stub/number-isnan';

export function IsFiniteNonNegativeNumber(v: number): boolean {
  if (!IsNonNegativeNumber(v)) {
    return false;
  }

  if (v === Infinity) {
    return false;
  }

  return true;
}

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
