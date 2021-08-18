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
 * @license
 * ${pkg.name} v${pkg.version}
 * Copyright 2021 Mattias Buelens, Diwank Singh Tomer and other contributors.
 * This code is released under the MIT license.
 * SPDX-License-Identifier: MIT
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

function esm({ target } = {}) {
  // We use code splitting for ESM so the polyfill bundle will `import` the ponyfill bundle.
  return {
    input: [
      'src/polyfill.ts',
      'src/ponyfill.ts'
    ],
    output: [
      {
        dir: 'dist',
        entryFileNames: `[name]${target === 'es6' ? '' : `.${target}`}.mjs`,
        format: 'es',
        banner,
        manualChunks: {
          ponyfill: ['src/ponyfill.ts']
        }
      }
    ],
    plugins: plugins({ target })
  };
}

function umd({ target } = {}) {
  // We don't use code splitting for UMD, but instead build two separate bundles.
  return [{
    input: `src/polyfill.ts`,
    output: [
      {
        file: `dist/polyfill${target === 'es6' ? '' : `.${target}`}.js`,
        format: 'iife',
        exports: 'none',
        banner,
        freeze: false
      }
    ],
    plugins: plugins({ target })
  }, {
    input: `src/ponyfill.ts`,
    output: [
      {
        file: `dist/ponyfill${target === 'es6' ? '' : `.${target}`}.js`,
        format: 'umd',
        exports: 'named',
        name: 'WebStreamsPolyfill',
        banner,
        freeze: false
      }
    ],
    plugins: plugins({ target })
  }];
}

function plugins({ target }) {
  return [
    typescript({
      tsconfig: `tsconfig${target === 'es6' ? '' : `-${target}`}.json`,
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
      functions: ['assert']
    }) : undefined,
    !debug ? terser({
      keep_classnames: keepRegex, // needed for WPT
      keep_fnames: keepRegex,
      mangle: {
        toplevel: true
      }
    }) : undefined
  ].filter(Boolean);
}

export default [
  esm({ target: 'es5' }),
  esm({ target: 'es6' }),
  ...umd({ target: 'es5' }),
  ...umd({ target: 'es6' })
];
