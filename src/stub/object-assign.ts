// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
const ObjectAssign: typeof Object.assign = Object.assign || function (target: object, ...sources: any[]): any {
  const to = Object(target);
  for (const source of sources) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        to[key] = source[key];
      }
    }
  }
  return to;
};

export default ObjectAssign;
