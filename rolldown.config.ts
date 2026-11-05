import fs from 'node:fs';
import path from 'node:path';
import { build, defineConfig, RolldownMagicString, type InputOptions, type ModuleFormat, type Plugin, type RolldownOptions } from 'rolldown';
import { parseAst } from 'rolldown/parseAst';
import { Visitor } from 'rolldown/utils';
import { dts } from 'rolldown-plugin-dts';
import { minify as swcMinify, transform as swcTransform } from '@swc/core';
import * as acorn from 'acorn';
import { analyze as analyzeScopes } from 'eslint-scope';

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

type Target = 'es2015' | 'es5' | 'es2018';

interface Output {
  entry: 'replace' | 'ponyfill';
  format: ModuleFormat;
  ext: 'js' | 'mjs';
}

/**
 * Every bundle we publish. Each row is built for both targets:
 * `dist/<entry>.<ext>` for ES2015 and `dist/<entry>.es5.<ext>` for ES5.
 */
const outputs: Output[] = [
  { entry: 'replace', format: 'iife', ext: 'js' },
  { entry: 'ponyfill', format: 'umd', ext: 'js' },
  { entry: 'ponyfill', format: 'esm', ext: 'mjs' }
];

/**
 * Input options shared by all bundles, for bundling our TypeScript sources at ES2015.
 */
function sourceInput(entry: string, target: 'es2015' | 'es2018' = 'es2015'): InputOptions {
  return {
    input: `src/${entry}.ts`,
    tsconfig: 'tsconfig.json',
    transform: {
      target,
      define: { DEBUG: String(debug) }
    },
    plugins: [!debug && stripAsserts()],
    checks: { circularDependency: false }
  };
}

/**
 * Removes every `assert(...)` statement, including its arguments.
 * (Marking `assert` as a pure function isn't enough: that keeps any arguments with side effects,
 * such as `assert(IsReadableStreamDefaultReader(reader))`, which slows down hot paths.)
 */
function stripAsserts(): Plugin {
  return {
    name: 'strip-asserts',
    transform: {
      filter: { id: /\.ts$/, code: 'assert(' },
      handler(code, id) {
        const ast = parseAst(code, { lang: 'ts', sourceType: 'module' }, id);
        const s = new RolldownMagicString(code);
        new Visitor({
          ExpressionStatement({ expression, start, end }) {
            if (expression.type === 'CallExpression'
              && expression.callee.type === 'Identifier'
              && expression.callee.name === 'assert') {
              // Keep an empty statement, in case this is the body of e.g. an `if` without braces.
              s.overwrite(start, end, ';');
            }
          }
        }).visit(ast);
        return { code: s };
      }
    }
  };
}

const symbolStub = path.resolve('src/stub/symbol.ts');

/**
 * ES5 environments may not have `Symbol`, so we replace it with `src/stub/symbol.ts`.
 * This runs on the downleveled ES5 module, so it also covers SWC's helpers.
 * (Rolldown's built-in `transform.inject` would also rewrite `Symbol` inside the stub itself.)
 */
function injectSymbolStub(): Plugin {
  return {
    name: 'inject-symbol-stub',
    transform: {
      filter: { id: /^es5:/ },
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
        ...sourceInput(entry),
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
 * Lowers the wrapped chunk to ES5 once more.
 * Rolldown re-prints the (already ES5) module in the second pass, and its code generator
 * re-introduces ES2015 syntax such as shorthand properties (`{ size }`).
 * The code is already ES5 apart from that, so SWC doesn't need to add any helpers here.
 */
function relowerES5(): Plugin {
  return {
    name: 'relower-es5',
    async renderChunk(code, _chunk, options) {
      const result = await swcTransform(code, {
        configFile: false,
        swcrc: false,
        sourceMaps: debug,
        inputSourceMap: false,
        isModule: options.format === 'es',
        env: {
          // IE 11 lacks all ES2015 syntax, so this lowers the same syntax as `target: 'es5'`.
          targets: 'ie 11',
          loose: true,
          // Rolldown's UMD wrapper uses `"u" > typeof module`. Lowering that for symbols
          // would add a helper above the wrapper, which references the global `Symbol`.
          exclude: ['transform-typeof-symbol']
        },
        jsc: {
          parser: { syntax: 'ecmascript' },
          externalHelpers: false
        }
      });
      return { code: result.code, map: result.map ? JSON.parse(result.map) : null };
    }
  };
}

/**
 * Minifies an ES5 chunk with SWC.
 *
 * ES2015 and ES5 bundles intentionally use different minifiers:
 * - Oxc's minifier only supports ES2015+ (e.g. it turns string literals into template literals),
 *   so it can't be used for ES5.
 * - SWC's compressor always rewrites `cancel(reason = undefined)` to `cancel(reason)`, changing
 *   `cancel.length` from 0 to 1, which fails the WPT IDL tests for the ES2015 bundles. (The ES5 bundles
 *   already lose default parameters when lowering to ES5, so those tests are expected to fail there anyway.)
 *   See https://github.com/swc-project/swc/issues/12203
 * The output guard checks the syntax of both.
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

/** Globals that the ES5 builds polyfill; any free reference to them bypasses the polyfill. */
const polyfilledGlobals = ['Symbol'];

/**
 * Verifies the final output: parses each chunk at the target's ECMAScript version and,
 * for ES5, checks that no free references to polyfilled globals remain.
 * This catches syntax that Oxc or SWC left unlowered, and helpers that reference a global directly.
 */
function outputGuard(target: Target): Plugin {
  const ecmaVersion = target === 'es5' ? 5 : target === 'es2018' ? 2018 : 2015;
  return {
    name: 'output-guard',
    generateBundle(options, files) {
      const sourceType = options.format === 'es' ? 'module' : 'script';
      for (const file of Object.values(files)) {
        if (file.type !== 'chunk') {
          continue;
        }
        const code = file.code;
        let ast: acorn.Program;
        try {
          ast = acorn.parse(code, { ecmaVersion, sourceType, ranges: true });
        } catch (error) {
          this.error(`${file.fileName}: not valid ${target} syntax: ${String(error)}`);
        }
        if (target !== 'es5') {
          continue;
        }
        // Acorn's AST types differ slightly from @types/estree (which eslint-scope uses), but the AST is the same.
        const { globalScope } = analyzeScopes(ast as Parameters<typeof analyzeScopes>[0], { ecmaVersion: 5, sourceType });
        for (const name of polyfilledGlobals) {
          const references = globalScope!.through.filter(reference => reference.identifier.name === name);
          if (references.length > 0) {
            const [start] = references[0].identifier.range!;
            this.error(`${file.fileName}: ${references.length} free references to the global "${name}" `
              + `bypass the polyfill (first near "${code.slice(Math.max(0, start - 40), start + 40)}")`);
          }
        }
      }
    }
  };
}

function bundle({ entry, format, ext }: Output, target: Target): RolldownOptions {
  const isES5 = target === 'es5';
  const name = isES5 ? `${entry}.es5` : entry;
  const input: InputOptions = isES5
    ? { input: `es5:${entry}`, plugins: [es5Entry(entry), injectSymbolStub(), relowerES5(), !debug && minifyES5()], checks: { circularDependency: false } }
    : sourceInput(entry);
  return {
    ...input,
    plugins: [input.plugins, outputGuard(target)],
    output: {
      file: `dist/${name}.${ext}`,
      format,
      name: format === 'umd' ? 'WebStreamsPolyfill' : undefined,
      exports: format === 'iife' ? 'none' : 'named',
      // Rolldown puts "use strict" above the IIFE/UMD wrapper, where it would also apply to any scripts
      // concatenated with ours. Put it inside the wrapper instead (like Rollup did).
      strict: false,
      intro: format === 'esm' ? undefined : '"use strict";',
      // Use ES5 syntax in Rolldown's own generated code for ES5 bundles, and don't emit `Symbol.toStringTag`
      // on the exports object (ES5 environments may not have `Symbol`).
      generatedCode: { preset: isES5 ? 'es5' : 'es2015', symbols: false },
      sourcemap: debug ? 'inline' : false,
      // Added after minification, so the minifier can't move or drop it.
      postBanner: banner,
      // Drop /* @__PURE__ */ annotations and JSDoc from production bundles.
      comments: debug ? true : { legal: false, annotation: false, jsdoc: false },
      // ES2015 bundles are minified with Oxc, ES5 bundles with SWC. See `minifyES5()` for why.
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
 * `dist/auto.js`, which installs the missing features on top of a native implementation,
 * or replaces it entirely if it's not complete enough to build on.
 * It includes the feature modules, so it targets ES2018 like them.
 */
function autoBundle(): RolldownOptions {
  const input = sourceInput('auto', 'es2018');
  return {
    ...input,
    plugins: [input.plugins, outputGuard('es2018')],
    output: {
      file: 'dist/auto.js',
      format: 'iife',
      exports: 'none',
      strict: false,
      intro: '"use strict";',
      generatedCode: { preset: 'es2015', symbols: false },
      sourcemap: debug ? 'inline' : false,
      postBanner: banner,
      comments: debug ? true : { legal: false, annotation: false, jsdoc: false },
      minify: debug
        ? false
        : {
            compress: { target: 'es2018' },
            mangle: { toplevel: true, reserved: keepNames },
            codegen: true
          }
    }
  };
}

/**
 * `dist/extend-native.mjs` and `dist/extend-native.js`: a ponyfill that subclasses the native stream classes.
 * It includes the feature modules, so it targets ES2018 like them.
 */
function extendNativeBundle(format: 'esm' | 'cjs'): RolldownOptions {
  const input = sourceInput('extend-native', 'es2018');
  return {
    ...input,
    plugins: [input.plugins, outputGuard('es2018')],
    output: {
      file: `dist/extend-native.${format === 'esm' ? 'mjs' : 'js'}`,
      format,
      exports: 'named',
      strict: false,
      intro: format === 'esm' ? undefined : '"use strict";',
      generatedCode: { preset: 'es2015', symbols: false },
      sourcemap: debug ? 'inline' : false,
      postBanner: banner,
      comments: debug ? true : { legal: false, annotation: false, jsdoc: false },
      minify: debug
        ? false
        : {
            compress: { target: 'es2018' },
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
    generateBundle(_options, files) {
      const file = files['ponyfill.d.ts'];
      if (file?.type === 'chunk') {
        this.emitFile({ type: 'asset', fileName: 'ponyfill.d.mts', source: file.code });
      }
    }
  };
}

/**
 * Bundled type definitions in `types/ponyfill.d.ts`.
 * (`types/replace.d.ts`, `types/auto.d.ts` and `types/extend-native.d.(m)ts` are hand-written.)
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

/**
 * Feature modules, which install missing features on top of a native streams implementation.
 * They're only published as ES modules, and only run in engines with native streams,
 * so they target ES2018 (they need async generators for `%AsyncIteratorPrototype%`).
 */
const features = ['index', 'readable-byte-streams', 'readable-stream-from', 'async-iterator', 'byob-read-min', 'transformer-cancel'];
const featureInput = Object.fromEntries(features.map(name => [`feature/${name}`, `src/feature/${name}.ts`]));

function featureBundle(): RolldownOptions {
  return {
    input: featureInput,
    tsconfig: 'tsconfig.json',
    transform: {
      target: 'es2018',
      define: { DEBUG: String(debug) }
    },
    plugins: [!debug && stripAsserts(), outputGuard('es2018')],
    checks: { circularDependency: false },
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].mjs',
      // Code shared between feature modules.
      chunkFileNames: 'feature/_[name].mjs',
      sourcemap: debug ? 'inline' : false,
      postBanner: banner,
      comments: debug ? true : { legal: false, annotation: false, jsdoc: false },
      minify: debug
        ? false
        : {
            compress: { target: 'es2018' },
            mangle: { toplevel: true, reserved: keepNames },
            codegen: true
          }
    }
  };
}

/**
 * Type definitions for the feature modules, in `types/feature/<name>.d.mts`.
 */
function featureTypes(): RolldownOptions {
  return {
    input: featureInput,
    tsconfig: 'tsconfig.json',
    plugins: [dts({ tsconfig: 'tsconfig.json', emitDtsOnly: true, sourcemap: false })],
    checks: { circularDependency: false },
    output: { dir: 'types', format: 'esm', entryFileNames: '[name].mjs', chunkFileNames: 'feature/_[name].mjs' }
  };
}

export default defineConfig([
  ...outputs.flatMap(output => [bundle(output, 'es2015'), bundle(output, 'es5')]),
  autoBundle(),
  extendNativeBundle('esm'),
  extendNativeBundle('cjs'),
  types(),
  featureBundle(),
  featureTypes()
]);
