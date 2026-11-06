# Migrating

## Version 4 to 5

Version 5 can build on top of the built-in streams implementation of your browser or runtime,
instead of always replacing it. See the [README](README.md#usage) for an overview of all variants.

* The `polyfill` and `polyfill/es5` variants are renamed to `replace` and `replace/es5`.
  They still unconditionally replace the global stream classes, just like before.
  The old names are removed, so that no existing import silently changes its behavior.
* The new `auto` variant is the recommended polyfill for web apps. It keeps the built-in stream classes
  if they are complete enough, and only adds the features they're missing (such as `ReadableStream.from()`
  or `transformer.cancel()`). Otherwise, it replaces them, like `replace`.
  Unlike `replace`, streams keep working with browser APIs such as `fetch()` and `Response`.
  The `auto` variant targets ES2018. If you need to support ES5 environments, keep using `replace/es5`.
* The new `extend-native` variant is a ponyfill that exports subclasses of the built-in stream classes,
  with the missing features added. Use `adopt(stream)` to convert streams created by the browser,
  such as `Response.body`. It falls back to this library's own implementation if the built-in streams are not complete enough.
* The new `feature` variants let you install individual features on top of the built-in streams.
* The ponyfill variants (`web-streams-polyfill` and `web-streams-polyfill/es5`) are unchanged.

The following table shows how to upgrade your v4 import to its equivalent v5 import:

| v4 import | v5 import | description |
| --- | --- | --- |
| `web-streams-polyfill/polyfill` | `web-streams-polyfill/auto` (recommended) or `web-streams-polyfill/replace` | ES2018+ polyfill on top of built-in streams, or ES2015+ polyfill that always replaces them |
| `web-streams-polyfill/polyfill/es5` | `web-streams-polyfill/replace/es5` | ES5+ polyfill |
| `web-streams-polyfill` | `web-streams-polyfill` | ES2015+ ponyfill |
| `web-streams-polyfill/es5` | `web-streams-polyfill/es5` | ES5+ ponyfill |

If you load the polyfill through a `<script>` tag, replace `dist/polyfill.js` with `dist/auto.js` (or `dist/replace.js`),
and `dist/polyfill.es5.js` with `dist/replace.es5.js`.

## Version 3 to 4

Version 4 restructures the library's exports to have more modern defaults, and employs modern best practices for publishing npm packages.

* The default export (i.e. `import "web-streams-polyfill"`) is now the *ponyfill* variant instead of the *polyfill* variant, to avoid modifying the global scope. If you do want to install the polyfill on the global scope, switch to
  the `polyfill` variant.
* The default export uses ES2015 syntax and targets modern Node and browser environments. If you need to support ES5 environments, switch to either the `es5` or `polyfill/es5` variant.
* The polyfill variant no longer re-exports the ponyfill, so `import { ReadableStream } from "web-streams-polyfill/polyfill"` won't work. Instead, use the global `ReadableStream` variable directly after loading the polyfill, or switch to the default (non-polyfill) variant.
* The project uses [Node's subpath exports](https://nodejs.org/api/packages.html#packages_package_entry_points) to provide each variant as a [dual module (UMD/ESM)](https://nodejs.org/api/packages.html#packages_dual_commonjs_es_module_packages). You need Node 12.20.0 or higher to resolve these variants. If you're using a bundler (like webpack or Rollup), you need to make sure it's up-to-date too. If you're using TypeScript, your [`moduleResolution`](https://www.typescriptlang.org/tsconfig#moduleResolution) must be set to `"node16"`, `"nodenext"` or `"bundler"`.

Version 4 also focuses on reducing the download size of the published npm package.

* All published JavaScript code is now minified, without source maps. If you need to debug the polyfill, you can [clone it](https://github.com/MattiasBuelens/web-streams-polyfill) and [build it yourself](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/CONTRIBUTING.md).
* The ES2018 variant was removed, since it had only minor differences with the ES2015 variant. If you were using this variant, switch to the default export instead.

The following table shows how to upgrade your v3 import to their equivalent v4 import:

| v3 import | v4 import | description |
| --- | --- | --- |
| `web-streams-polyfill` | `web-streams-polyfill/polyfill/es5` | ES5+ polyfill |
| `web-streams-polyfill/es6` | `web-streams-polyfill/polyfill` | ES2015+ polyfill |
| `web-streams-polyfill/es2018` | `web-streams-polyfill/polyfill` | ES2015+ polyfill |
| `web-streams-polyfill/ponyfill` | `web-streams-polyfill/es5` | ES5+ ponyfill |
| `web-streams-polyfill/ponyfill/es6` | `web-streams-polyfill` | ES2015+ ponyfill |
| `web-streams-polyfill/ponyfill/es2018` | `web-streams-polyfill` | ES2015+ ponyfill |
