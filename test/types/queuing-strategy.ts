import * as polyfill from '../../';

const countingStrategy: polyfill.CountQueuingStrategy = new polyfill.CountQueuingStrategy({ highWaterMark: 5 });
const byteLengthStrategy: polyfill.ByteLengthQueuingStrategy = new polyfill.ByteLengthQueuingStrategy({ highWaterMark: 1024 });

const countingAsStrategy: polyfill.QueuingStrategy<any> = countingStrategy;
const byteLengthAsStrategy: polyfill.QueuingStrategy<ArrayBufferView> = byteLengthStrategy;

// Compatibility with stream types from DOM
const domCountingStrategy: CountQueuingStrategy = countingStrategy;
const domByteLengthStrategy: ByteLengthQueuingStrategy = byteLengthStrategy;
