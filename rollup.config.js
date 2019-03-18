const path = require('path');

const { js, dts } = require('rollup-plugin-dts');
const inject = require('rollup-plugin-inject');
const strip = require('rollup-plugin-strip');
const { terser } = require('rollup-plugin-terser');

const pkg = require('./package.json');
const banner = `
/**
 * ${pkg.name} v${pkg.version}
 */
`.trim();
const bannerDts = `
/**
 * Type definitions for ${pkg.name} v${pkg.version}
 */
/// <reference lib="dom" />
/// <reference lib="esnext.asynciterable" />
`.trim() + '\n';

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
      js({
        tsconfig: `src/tsconfig${target === 'es5' ? '' : `-${target}`}.json`
      }),
      inject({
        include: 'src/**/*.ts',
        exclude: 'src/stub/symbol.ts',
        modules: {
          Symbol: path.resolve(__dirname, './src/stub/symbol.ts')
        }
      }),
      strip({
        include: 'src/**/*.ts',
        functions: ['assert'],
        sourceMap: true
      }),
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

function types(entry) {
  return {
    input: `src/${entry}.ts`,
    output: {
      file: `dist/types/${entry}.d.ts`,
      format: 'es',
      banner: bannerDts
    },
    plugins: [
      dts({
        tsconfig: 'src/tsconfig.json',
        banner: false
      })
    ]
  };
}

module.exports = [
  // types
  types('polyfill'),
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
