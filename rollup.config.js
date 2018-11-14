const path = require('path');

const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupAlias = require('rollup-plugin-alias');
const rollupBabel = require('rollup-plugin-babel');
const rollupInject = require('rollup-plugin-inject');
const rollupStrip = require('rollup-plugin-strip');
const { terser: rollupTerser } = require('rollup-plugin-terser');

function buildConfig(entry, { esm = false, minify = false, es6 = false } = {}) {
  const outname = `${entry}${es6 ? '.es6' : ''}`;
  return {
    input: `src/${entry}.js`,
    output: [
      {
        file: `dist/${outname}${minify ? '.min' : ''}.js`,
        format: 'umd',
        freeze: false,
        sourcemap: true,
        name: 'WebStreamsPolyfill'
      },
      esm ? {
        file: `dist/${outname}${minify ? '.min' : ''}.mjs`,
        format: 'es',
        freeze: false,
        sourcemap: true
      } : undefined
    ].filter(Boolean),
    plugins: [
      rollupCommonJS({
        include: 'spec/reference-implementation/lib/*.js',
        sourceMap: true
      }),
      rollupInject({
        include: 'spec/reference-implementation/lib/*.js',
        modules: {
          'Symbol': path.resolve(__dirname, `./src/stub/symbol.js`),
          'Number.isNaN': path.resolve(__dirname, `./src/stub/number-isnan.js`),
          'Number.isInteger': path.resolve(__dirname, `./src/stub/number-isinteger.js`)
        }
      }),
      rollupStrip({
        functions: ['assert', 'debug', 'verbose'],
        sourceMap: true
      }),
      rollupAlias({
        'assert': path.resolve(__dirname, `./src/stub/assert.js`),
        'better-assert': path.resolve(__dirname, `./src/stub/better-assert.js`),
        'debug': path.resolve(__dirname, `./src/stub/debug.js`)
      }),
      !es6 ? rollupBabel({
        sourceMap: true
      }) : undefined,
      minify ? rollupTerser({
        keep_classnames: true, // needed for WPT
        mangle: {
          toplevel: true
        },
        compress: {
          inline: 1 // TODO re-enable when this is fixed: https://github.com/mishoo/UglifyJS2/issues/2842
        },
        sourcemap: true
      }) : undefined
    ].filter(Boolean)
  };
}

module.exports = [
  buildConfig('polyfill', { esm: true }),
  buildConfig('polyfill', { minify: true }),
  buildConfig('ponyfill', { esm: true }),
  buildConfig('ponyfill', { es6: true, esm: true }),
  buildConfig('ponyfill', { es6: true, minify: true })
];
