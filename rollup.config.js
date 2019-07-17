const path = require('path');

const typescript = require('rollup-plugin-typescript2');
const inject = require('rollup-plugin-inject');
const strip = require('rollup-plugin-strip');
const replace = require('rollup-plugin-replace');
const { terser } = require('rollup-plugin-terser');

const debug = false;

const pkg = require('./package.json');
const banner = `
/**
 * ${pkg.name} v${pkg.version}
 */
`.trim();

function bundle(entry, { esm = false, minify = false, target = 'es5' } = {}) {
  const outname = `${entry}${target === 'es5' ? '' : `.${target}`}`;
  return {
    input: `src/${entry}.ts`,
    output: [
      {
        file: `dist/${outname}${minify ? '.min' : ''}.js`,
        format: 'umd',
        name: 'WebStreamsPolyfill',
        banner,
        freeze: false,
        sourcemap: true
      },
      esm ? {
        file: `dist/${outname}${minify ? '.min' : ''}.mjs`,
        format: 'es',
        banner,
        freeze: false,
        sourcemap: true
      } : undefined
    ].filter(Boolean),
    plugins: [
      typescript({
        tsconfig: `src/tsconfig${target === 'es5' ? '' : `-${target}`}.json`,
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            declarationMap: false
          }
        }
      }),
      inject({
        include: 'src/**/*.ts',
        exclude: 'src/stub/symbol.ts',
        modules: {
          Symbol: path.resolve(__dirname, './src/stub/symbol.ts')
        }
      }),
      replace({
        include: 'src/**/*.ts',
        values: {
          DEBUG: debug
        }
      }),
      !debug ? strip({
        include: 'src/**/*.ts',
        functions: ['assert'],
        sourceMap: true
      }) : undefined,
      minify ? terser({
        keep_classnames: true, // needed for WPT
        mangle: {
          toplevel: true
        },
        sourcemap: true
      }) : undefined
    ].filter(Boolean)
  };
}

module.exports = [
  // polyfill
  bundle('polyfill', { esm: true }),
  bundle('polyfill', { minify: true }),
  // polyfill/es6
  bundle('polyfill', { target: 'es6', esm: true }),
  bundle('polyfill', { target: 'es6', minify: true }),
  // polyfill/es2018
  bundle('polyfill', { target: 'es2018', esm: true }),
  bundle('polyfill', { target: 'es2018', minify: true }),
  // ponyfill
  bundle('ponyfill', { esm: true }),
  // ponyfill/es6
  bundle('ponyfill', { target: 'es6', esm: true }),
  // ponyfill/es2018
  bundle('ponyfill', { target: 'es2018', esm: true })
];
