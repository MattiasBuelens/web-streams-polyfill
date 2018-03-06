const path = require('path');

const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupAlias = require('rollup-plugin-alias');
const rollupBabel = require('rollup-plugin-babel');
const rollupStrip = require('rollup-plugin-strip');
const rollupUglify = require('rollup-plugin-uglify');

const TARGET = process.env.BUILD_TARGET || 'dev';

function buildConfig(entry, target) {
  const DEV = TARGET === 'dev';
  const MIN = TARGET === 'min';
  const WPT = TARGET === 'wpt';

  const SUFFIX = MIN ? '.min' : WPT ? '.wpt' : '';

  return {
    input: 'src/polyfill.js',
    output: [
      {
        file: 'dist/polyfill' + SUFFIX + '.js',
        format: 'umd',
        freeze: false,
        sourcemap: true,
        name: 'WebStreamsPolyfill'
      },
      (DEV) ? {
        file: 'dist/polyfill' + SUFFIX + '.es.js',
        format: 'es',
        freeze: false,
        sourcemap: true
      } : undefined
    ].filter(Boolean),
    plugins: [
      rollupCommonJS({
        include: 'spec/reference-implementation/lib/*.js'
      }),
      MIN ? rollupStrip({
        functions: ['assert', 'debug', 'verbose']
      }) : undefined,
      rollupAlias(MIN ? {
        'better-assert': path.resolve(__dirname, './src/stub/min/better-assert.js'),
        'debug': path.resolve(__dirname, './src/stub/min/debug.js')
      } : {
        'better-assert': path.resolve(__dirname, './src/stub/no-min/better-assert.js'),
        'debug': path.resolve(__dirname, './src/stub/no-min/debug.js')
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
}

module.exports = buildConfig('polyfill', TARGET);
