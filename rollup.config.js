const path = require('path');

const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupAlias = require('rollup-plugin-alias');

module.exports = {
  input: 'src/index.es6.js',
  output: [{
    file: 'dist/polyfill.js',
    format: 'umd',
    name: 'WebStreamsPolyfill'
  }],
  plugins: [
    rollupCommonJS({
      include: 'spec/reference-implementation/lib/*.js'
    }),
    rollupAlias({
      'better-assert': path.resolve(__dirname, './src/stub/better-assert.js'),
      'debug': path.resolve(__dirname, './src/stub/debug.js')
    })
  ]
};
