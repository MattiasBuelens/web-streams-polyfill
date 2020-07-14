/// <reference lib="es2015.core" />

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc#Polyfill
const MathTrunc: typeof Math.trunc = Math.trunc || function (v) {
  return v < 0 ? Math.ceil(v) : Math.floor(v);
};

export default MathTrunc;
