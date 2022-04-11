# Migrating

## Version 3 to 4

Version 4 restructures the library's exports to have more modern defaults, and employs modern best practices for
publishing npm packages.

* The default export (i.e. `import "web-streams-polyfill"`) is now the *ponyfill* variant instead of the *polyfill*
  variant, to avoid modifying the global scope. If you do want to install the polyfill on the global scope, switch to
  the `polyfill` variant.
* The default export uses ES2015 syntax and targets modern Node and browser environments. If you need to support ES5
  environments, switch to either the `es5` or `polyfill/es5` variant.
* The polyfill variant no longer re-exports the ponyfill,
  so `import { ReadableStream } from "web-streams-polyfill/polyfill"` won't work. Instead, use the
  global `ReadableStream` variable directly after loading the polyfill, or switch to the default (non-polyfill) variant.
* The project
  uses [Node's package entry points](https://nodejs.org/api/packages.html#packages_package_entry_points) (`exports`
  in `package.json`) to provide each variant as
  a [dual module (UMD/ESM)](https://nodejs.org/api/packages.html#packages_dual_commonjs_es_module_packages). You need
  Node 12.20.0 or higher to resolve these variants. If you're using a bundler (like webpack or Rollup), you need to make
  sure it's up-to-date too.
  * For backwards compatibility, a fallback is provided that uses the same structure as in version 3. This should help
    for older versions of Node or when using TypeScript 4.6 or lower, which do not (yet) understand package entry points.
    If you still have problems with importing these variants, [file an issue](https://github.com/MattiasBuelens/web-streams-polyfill/issues).

Version 4 also focuses on reducing the download size of the published npm package.

* All published JavaScript code is now minified, without source maps. If you need to debug the polyfill, you
  can [clone it](https://github.com/MattiasBuelens/web-streams-polyfill)
  and [build it yourself](https://github.com/MattiasBuelens/web-streams-polyfill/blob/v3.1.0/CONTRIBUTING.md).
* The ES2018 variant was removed, since it had only minor differences with the ES2015 variant. If you were using this
  variant, switch to the default export instead.

The following table shows how to upgrade your v3 import to their equivalent v4 import:

| v3 import | v4 import | description |
| --- | --- | --- |
| `web-streams-polyfill` | `web-streams-polyfill/polyfill/es5` | ES5+ polyfill |
| `web-streams-polyfill/es6` | `web-streams-polyfill/polyfill` | ES2015+ polyfill |
| `web-streams-polyfill/es2018` | `web-streams-polyfill/polyfill` | ES2015+ polyfill |
| `web-streams-polyfill/ponyfill` | `web-streams-polyfill/es5` | ES5+ ponyfill |
| `web-streams-polyfill/ponyfill/es6` | `web-streams-polyfill` | ES2015+ ponyfill |
| `web-streams-polyfill/ponyfill/es2018` | `web-streams-polyfill` | ES2015+ ponyfill |
