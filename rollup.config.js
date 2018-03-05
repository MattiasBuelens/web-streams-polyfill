const path = require('path');

const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupAlias = require('rollup-plugin-alias');
const rollupUglify = require('rollup-plugin-uglify');

const PRODUCTION = process.env.NODE_ENV === 'production';

module.exports = {
  input: 'src/index.es6.js',
  output: [{
    file: PRODUCTION ? 'dist/polyfill.min.js' : 'dist/polyfill.js',
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
    }),
    PRODUCTION ? rollupUglify({
      keep_classnames: true, // needed for WPT
      compress: {
        inline: 1 // TODO re-enable when this is fixed: https://github.com/mishoo/UglifyJS2/issues/2842
      }
    }) : undefined
  ].filter(Boolean)
};
