const path = require('path');

const rollupCommonJS = require('rollup-plugin-commonjs');
const rollupAlias = require('rollup-plugin-alias');
const rollupBabel = require('rollup-plugin-babel');
const rollupInject = require('rollup-plugin-inject');
const rollupStrip = require('rollup-plugin-strip');
const rollupUglify = require('rollup-plugin-uglify');

function buildConfig(entry, { esm = false, cjs = false, minify = false, es6 = false } = {}) {
  const suffix = `${es6 ? '.es6' : ''}${minify ? '.min' : ''}`;
  return {
    input: `src/${entry}.js`,
    output: [
      {
        file: `dist/${entry}${cjs ? '.cjs' : '.umd'}${suffix}.js`,
        format: cjs ? 'cjs' : 'umd',
        freeze: false,
        sourcemap: true,
        name: 'WebStreamsPolyfill'
      },
      esm ? {
        file: `dist/${entry}${suffix}.mjs`,
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
      minify ? rollupStrip({
        functions: ['assert', 'debug', 'verbose'],
        sourceMap: true
      }) : undefined,
      rollupAlias({
        'assert': path.resolve(__dirname, `./src/stub/${minify ? 'min' : 'no-min'}/assert.js`),
        'better-assert': path.resolve(__dirname, `./src/stub/${minify ? 'min' : 'no-min'}/better-assert.js`),
        'debug': path.resolve(__dirname, `./src/stub/${minify ? 'min' : 'no-min'}/debug.js`)
      }),
      !es6 ? rollupBabel({
        sourceMap: true
      }) : undefined,
      minify ? rollupUglify({
        keep_classnames: true, // needed for WPT
        compress: {
          inline: 1 // TODO re-enable when this is fixed: https://github.com/mishoo/UglifyJS2/issues/2842
        },
        sourceMap: true
      }) : undefined
    ].filter(Boolean)
  };
}

module.exports = [
  buildConfig('polyfill', { esm: true }),
  buildConfig('polyfill', { minify: true }),
  buildConfig('ponyfill', { cjs: true, esm: true }),
  buildConfig('ponyfill', { cjs: true, minify: true }),
  buildConfig('ponyfill', { cjs: true, es6: true, esm: true })
];
