import path from 'path';
import typescript from '@rollup/plugin-typescript';
import inject from '@rollup/plugin-inject';
import strip from '@rollup/plugin-strip';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

const debug = false;

const banner = `
/**
 * ${pkg.name} v${pkg.version}
 */
`.trim();

const keepNames = [
  // Class names
  'ReadableStream',
  'ReadableStreamDefaultController',
  'ReadableByteStreamController',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultReader',
  'ReadableStreamBYOBReader',
  'WritableStream',
  'WritableStreamDefaultWriter',
  'WritableStreamDefaultController',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'TransformStream',
  'TransformStreamDefaultController',
  // Queuing strategy "size" getter
  'size'
];
const keepRegex = new RegExp(`^(${keepNames.join('|')})$`);

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
        tsconfig: `tsconfig${target === 'es5' ? '' : `-${target}`}.json`,
        declaration: false,
        declarationMap: false
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
        preventAssignment: true,
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
        keep_classnames: keepRegex, // needed for WPT
        keep_fnames: keepRegex,
        mangle: {
          toplevel: true
        }
      }) : undefined
    ].filter(Boolean)
  };
}

export default [
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
