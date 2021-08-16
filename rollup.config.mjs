import fs from 'fs';
import path from 'path';
import url from 'url';
import typescript from '@rollup/plugin-typescript';
import inject from '@rollup/plugin-inject';
import strip from '@rollup/plugin-strip';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const debug = false;

const banner = `
/**
 * @license
 * ${pkg.name} v${pkg.version}
 * Copyright 2024 Mattias Buelens, Diwank Singh Tomer and other contributors.
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

function esm({ target = 'es5' } = {}) {
  // We use code splitting for ESM so the polyfill bundle will `import` the ponyfill bundle.
  return {
    input: [
      'src/polyfill.ts',
      'src/ponyfill.ts'
    ],
    output: [
      {
        dir: 'dist',
        entryFileNames: `[name]${target === 'es5' ? '' : `.${target}`}.mjs`,
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

function umd({ target = 'es5' } = {}) {
  // We don't use code splitting for UMD, but instead build two separate bundles.
  return ['polyfill', 'ponyfill'].map(entry => ({
    input: `src/${entry}.ts`,
    output: [
      {
        file: `dist/${entry}${target === 'es5' ? '' : `.${target}`}.js`,
        format: 'umd',
        name: 'WebStreamsPolyfill',
        banner,
        freeze: false
      }
    ],
    plugins: plugins({ target })
  }));
}

function plugins({ target }) {
  return [
    typescript({
      tsconfig: `tsconfig${target === 'es5' ? '' : `-${target}`}.json`,
      declaration: false,
      declarationMap: false
    }),
    target === 'es5' ? inject({
      include: 'src/**/*.ts',
      exclude: 'src/stub/symbol.ts',
      modules: {
        Symbol: path.resolve(dirname, './src/stub/symbol.ts')
      }
    }) : undefined,
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
