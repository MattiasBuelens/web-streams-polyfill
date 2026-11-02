import fs from 'node:fs';
import path from 'node:path';
import { build, defineConfig, RolldownMagicString, type InputOptions, type ModuleFormat, type Plugin, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { minify as swcMinify, transform as swcTransform } from '@swc/core';

/**
 * Build mode, set with `rolldown -c --environment BUILD:debug`.
 *
 * - `prod` (default): minified, assertions stripped, `DEBUG = false`.
 * - `debug`: unminified, assertions enabled, `DEBUG = true`, inline source maps.
 */
const debug = process.env.BUILD === 'debug';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const banner = `
/**
 * @license
 * ${pkg.name} v${pkg.version}
 * Copyright ${new Date().getUTCFullYear()} Mattias Buelens, Diwank Singh Tomer and other contributors.
 * This code is released under the MIT license.
 * SPDX-License-Identifier: MIT
 */
`.trim();

// Names that must survive minification, since WPT checks them.
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

type Target = 'es2015' | 'es5';

interface Output {
  entry: 'polyfill' | 'ponyfill';
  format: ModuleFormat;
  ext: 'js' | 'mjs';
}

/**
 * Every bundle we publish. Each row is built for both targets:
 * `dist/<entry>.<ext>` for ES2015 and `dist/<entry>.es5.<ext>` for ES5.
 */
const outputs: Output[] = [
  { entry: 'polyfill', format: 'iife', ext: 'js' },
  { entry: 'ponyfill', format: 'umd', ext: 'js' },
  { entry: 'ponyfill', format: 'esm', ext: 'mjs' }
];

/**
 * Input options shared by all bundles, for bundling our TypeScript sources at ES2015.
 */
function sourceInput(entry: string, target: Target): InputOptions {
  return {
    input: `src/${entry}.ts`,
    tsconfig: 'tsconfig.json',
    transform: {
      target: 'es2015',
      define: { DEBUG: String(debug) }
    },
    plugins: target === 'es5' ? [injectSymbolStub()] : [],
    treeshake: debug ? true : { manualPureFunctions: ['assert'] },
    checks: { circularDependency: false }
  };
}

const symbolStub = path.resolve('src/stub/symbol.ts');

/**
 * ES5 environments may not have `Symbol`, so we replace it with `src/stub/symbol.ts`.
 * (Rolldown's built-in `transform.inject` would also rewrite `Symbol` inside the stub itself.)
 */
function injectSymbolStub(): Plugin {
  return {
    name: 'inject-symbol-stub',
    transform: {
      filter: { id: { include: /[\\/]src[\\/].*\.ts$/, exclude: /[\\/]src[\\/]stub[\\/]symbol\.ts$/ } },
      handler(code) {
        if (!/\bSymbol\b/.test(code)) {
          return;
        }
        const s = new RolldownMagicString(code);
        s.prepend(`import Symbol from ${JSON.stringify(symbolStub)};\n`);
        return { code: s };
      }
    }
  };
}

/**
 * Downlevels a whole entry to ES5 with SWC.
 *
 * Neither Oxc nor TypeScript 7 can target ES5, so we:
 * 1. bundle the entry to a single unminified ES2015 module,
 * 2. transform that module to ES5 with SWC, inlining its helpers at the top level, and
 * 3. return it as the (only) module of the outer build,
 *    which then wraps it in the output format (so the helpers end up *inside* the IIFE/UMD wrapper).
 */
function es5Entry(entry: string): Plugin {
  // Not prefixed with \0, since Rolldown would then leave this module out of the source map.
  const id = `es5:${entry}`;
  return {
    name: 'es5-entry',
    resolveId(source) {
      if (source === id) {
        return id;
      }
    },
    async load(source) {
      if (source !== id) {
        return;
      }
      const result = await build({
        ...sourceInput(entry, 'es5'),
        write: false,
        logLevel: 'warn',
        output: { format: 'esm', sourcemap: debug }
      });
      const chunk = result.output[0];
      for (const moduleId of chunk.moduleIds) {
        if (!moduleId.startsWith('\0')) {
          this.addWatchFile(moduleId);
        }
      }
      const es5 = await swcTransform(chunk.code, {
        filename: `${entry}.js`,
        configFile: false,
        swcrc: false,
        inputSourceMap: chunk.map ? JSON.stringify(chunk.map) : undefined,
        sourceMaps: debug,
        isModule: true,
        jsc: {
          target: 'es5',
          parser: { syntax: 'ecmascript' },
          externalHelpers: false,
          loose: true
        }
      });
      return { code: es5.code, map: es5.map ? JSON.parse(es5.map) : null, moduleType: 'js' };
    }
  };
}

/**
 * Minifies an ES5 chunk with SWC.
 * Oxc's minifier only supports ES2015+ (e.g. it turns string literals into template literals).
 */
function minifyES5(): Plugin {
  return {
    name: 'minify-es5',
    async renderChunk(code, _chunk, options) {
      const result = await swcMinify(code, {
        ecma: 5,
        module: options.format === 'es',
        compress: { ecma: 5 },
        mangle: { reserved: keepNames, topLevel: true },
        format: { comments: false },
        sourceMap: false
      });
      return { code: result.code, map: null };
    }
  };
}

function bundle({ entry, format, ext }: Output, target: Target): RolldownOptions {
  const isES5 = target === 'es5';
  const name = isES5 ? `${entry}.es5` : entry;
  const input: InputOptions = isES5
    ? { input: `es5:${entry}`, plugins: [es5Entry(entry), !debug && minifyES5()], checks: { circularDependency: false } }
    : sourceInput(entry, target);
  return {
    ...input,
    output: {
      file: `dist/${name}.${ext}`,
      format,
      name: format === 'umd' ? 'WebStreamsPolyfill' : undefined,
      exports: format === 'iife' ? 'none' : 'named',
      sourcemap: debug ? 'inline' : false,
      // Added after minification, so the minifier can't move or drop it.
      postBanner: banner,
      // Drop /* @__PURE__ */ annotations and JSDoc from production bundles.
      comments: debug ? true : { legal: false, annotation: false, jsdoc: false },
      minify: debug || isES5
        ? false
        : {
            compress: { target: 'es2015' },
            mangle: { toplevel: true, reserved: keepNames },
            codegen: true
          }
    }
  };
}

/**
 * Copies `ponyfill.d.ts` to `ponyfill.d.mts`, so TypeScript sees ESM types for the `import` condition
 * (instead of CommonJS types, which would make default imports ambiguous).
 */
function dtsForESM(): Plugin {
  return {
    name: 'dts-for-esm',
    generateBundle(_options, bundle) {
      const file = bundle['ponyfill.d.ts'];
      if (file?.type === 'chunk') {
        this.emitFile({ type: 'asset', fileName: 'ponyfill.d.mts', source: file.code });
      }
    }
  };
}

/**
 * Bundled type definitions in `types/ponyfill.d.ts`.
 * (`types/polyfill.d.ts` is hand-written, and re-exports these.)
 */
function types(): RolldownOptions {
  return {
    input: 'src/ponyfill.ts',
    tsconfig: 'tsconfig.json',
    plugins: [dts({ tsconfig: 'tsconfig.json', emitDtsOnly: true, sourcemap: false }), dtsForESM()],
    checks: { circularDependency: false },
    output: { dir: 'types' }
  };
}

export default defineConfig([
  ...outputs.flatMap(output => [bundle(output, 'es2015'), bundle(output, 'es5')]),
  types()
]);
