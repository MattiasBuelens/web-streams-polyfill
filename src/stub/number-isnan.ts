// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isNaN#Polyfill
const NumberIsNaN: typeof Number.isNaN = Number.isNaN || function (x) {
  // eslint-disable-next-line no-self-compare
  return x !== x;
};

export default NumberIsNaN;
