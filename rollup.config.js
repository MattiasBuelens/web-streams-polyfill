const path = require('path');

const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupAlias = require('rollup-plugin-alias');
const rollupBabel = require('rollup-plugin-babel');
const rollupUglify = require('rollup-plugin-uglify');

const TARGET = process.env.BUILD_TARGET || 'dev';
const DEV = TARGET === 'dev';
const MIN = TARGET === 'min';
const WPT = TARGET === 'wpt';

const SUFFIX = MIN ? '.min' : WPT ? '.wpt' : '';

module.exports = {
  input: 'src/index.es6.js',
  output: [{
    file: 'dist/polyfill' + SUFFIX + '.js',
    format: 'umd',
    name: 'WebStreamsPolyfill'
  }, {
    file: 'dist/polyfill.es' + SUFFIX + '.js',
    format: 'es'
  }],
  plugins: [
    rollupCommonJS({
      include: 'spec/reference-implementation/lib/*.js'
    }),
    rollupAlias({
      'better-assert': path.resolve(__dirname, './src/stub/better-assert.js'),
      'debug': path.resolve(__dirname, './src/stub/debug.js')
    }),
    (!WPT) ? rollupBabel() : undefined,
    (MIN || WPT) ? rollupUglify({
      keep_classnames: true, // needed for WPT
      compress: {
        inline: 1 // TODO re-enable when this is fixed: https://github.com/mishoo/UglifyJS2/issues/2842
      }
    }) : undefined
  ].filter(Boolean)
};
