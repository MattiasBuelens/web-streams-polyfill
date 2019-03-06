const path = require('path');

const ts = require('typescript');
const rollupDts = require('rollup-plugin-dts');
const rollupInject = require('rollup-plugin-inject');
const rollupStrip = require('rollup-plugin-strip');
const { terser: rollupTerser } = require('rollup-plugin-terser');

function buildConfig(entry, { esm = false, minify = false, target = 'es5' } = {}) {
  const outname = `${entry}${target === 'es5' ? '' : `.${target}`}`;
  return {
    input: `src/${entry}.ts`,
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
      rollupDts.js({
        tsconfig: `src/tsconfig${target === 'es5' ? '' : `-${target}`}.json`
      }),
      rollupInject({
        include: 'src/**/*.ts',
        exclude: 'src/stub/symbol.ts',
        modules: {
          Symbol: path.resolve(__dirname, './src/stub/symbol.ts')
        }
      }),
      // FIXME
      // rollupStrip({
      //   include: 'src/**/*.ts',
      //   functions: ['assert', 'debug', 'verbose'],
      //   sourceMap: true
      // }),
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
  // polyfill
  buildConfig('polyfill', { esm: true }),
  buildConfig('polyfill', { minify: true }),
  // polyfill/es6
  buildConfig('polyfill', { target: 'es6', esm: true }),
  buildConfig('polyfill', { target: 'es6', minify: true }),
  // polyfill/es2018
  buildConfig('polyfill', { target: 'es2018', esm: true }),
  buildConfig('polyfill', { target: 'es2018', minify: true }),
  // ponyfill
  buildConfig('ponyfill', { esm: true }),
  // ponyfill/es6
  buildConfig('ponyfill', { target: 'es6', esm: true }),
  // ponyfill/es2018
  buildConfig('ponyfill', { target: 'es2018', esm: true })
];
