/// <reference lib="es2015.core" />

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite#Polyfill
const NumberIsFinite: typeof Number.isFinite = Number.isFinite || function (x) {
  return typeof x === 'number' && isFinite(x);
};

export default NumberIsFinite;
