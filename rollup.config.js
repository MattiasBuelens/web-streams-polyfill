const path = require('path');

const rollupTypescript = require('rollup-plugin-typescript');
const rollupInject = require('rollup-plugin-inject');
const rollupStrip = require('rollup-plugin-strip');
const { terser: rollupTerser } = require('rollup-plugin-terser');

function buildConfig(entry, { esm = false, minify = false, es6 = false } = {}) {
  const outname = `${entry}${es6 ? '.es6' : ''}`;
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
      rollupTypescript({
        tsconfig: 'src/tsconfig.json',
        target: es6 ? 'es2015' : 'es5'
      }),
      rollupInject({
        include: 'src/**/*.ts',
        exclude: 'src/stub/symbol.ts',
        modules: {
          Symbol: path.resolve(__dirname, './src/stub/symbol.ts')
        }
      }),
      rollupStrip({
        include: 'src/**/*.ts',
        functions: ['assert', 'debug', 'verbose'],
        sourceMap: true
      }),
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
  buildConfig('polyfill', { es6: true, esm: true }),
  buildConfig('polyfill', { es6: true, minify: true }),
  // ponyfill
  buildConfig('ponyfill', { esm: true }),
  // ponyfill/es6
  buildConfig('ponyfill', { es6: true, esm: true })
];
