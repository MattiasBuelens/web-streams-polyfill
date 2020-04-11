# Changelog

> **Tags:**
> - 💥 Breaking Change
> - 👓 Spec Compliance
> - 🚀 New Feature
> - 🐛 Bug Fix
> - 📝 Documentation
> - 🏠 Internal
> - 💅 Polish

## v2.1.1 (2020-04-11)

* 💅 Improve `ReadResult` in TypeScript type definitions. ([759506e](https://github.com/MattiasBuelens/web-streams-polyfill/commit/759506e00e55289ae6f92f30922b8855fcddd9ab), [#49](https://github.com/MattiasBuelens/web-streams-polyfill/pull/49))

## v2.1.0 (2020-02-23)

* 👓 Align with [spec version `ed00d2f`](https://github.com/whatwg/streams/tree/ed00d2fe2d53ac5ad9ff8e727c7ef0a68f424074/) ([#43](https://github.com/MattiasBuelens/web-streams-polyfill/issues/43), [#44](https://github.com/MattiasBuelens/web-streams-polyfill/pull/44))
* 🏠 Down-level type definitions for older TypeScript versions. ([#41](https://github.com/MattiasBuelens/web-streams-polyfill/pull/41))

## v2.0.6 (2019-11-08)

* 🐛 Fix type definitions to be compatible with TypeScript 3.3 and lower. ([#39](https://github.com/MattiasBuelens/web-streams-polyfill/issues/39), [#40](https://github.com/MattiasBuelens/web-streams-polyfill/pull/40))

## v2.0.5 (2019-10-08)

* 👓 Align with [spec version `ae5e0cb`](https://github.com/whatwg/streams/tree/ae5e0cb41e9f72cdd97f3a6d47bc674c1f4049d1/) ([#33](https://github.com/MattiasBuelens/web-streams-polyfill/pull/33))
* 🐛 Fix support for non-browser environments, such as Node.
  * Accept polyfilled `AbortSignal`s. ([#36](https://github.com/MattiasBuelens/web-streams-polyfill/pull/36))
  * Polyfill `DOMException` if necessary. ([#37](https://github.com/MattiasBuelens/web-streams-polyfill/pull/37))

## v2.0.4 (2019-08-01)

* 🐛 Fix pipe not aborting when both `preventAbort` and `preventCancel` are set ([#31](https://github.com/MattiasBuelens/web-streams-polyfill/pull/31))
* 👓 Align with [spec version `e4d3b1a`](https://github.com/whatwg/streams/tree/e4d3b1a826e34d27a7cb5485a1cc4b078608c9ec/) ([#31](https://github.com/MattiasBuelens/web-streams-polyfill/pull/31))

## v2.0.3 (2019-04-04)

* 👓 Align with [spec version `6f94580`](https://github.com/whatwg/streams/tree/6f94580f6731d1e017c516af097d47c45aad1f56/) ([#21](https://github.com/MattiasBuelens/web-streams-polyfill/pull/21))
* 🏠 Run web platform tests on ES5 variant ([#19](https://github.com/MattiasBuelens/web-streams-polyfill/pull/19))

## v2.0.2 (2019-03-17)

* 💅 Improve performance of `reader.read()` and `writer.write()` ([#17](https://github.com/MattiasBuelens/web-streams-polyfill/pull/17), [#18](https://github.com/MattiasBuelens/web-streams-polyfill/pull/18))

## v2.0.1 (2019-03-16)

* 🐛 Fix performance issue with large queues ([#15](https://github.com/MattiasBuelens/web-streams-polyfill/pull/15), [#16](https://github.com/MattiasBuelens/web-streams-polyfill/pull/16))

## v2.0.0 (2019-03-10)

* 💥 Ownership change: [@mattiasbuelens/web-streams-polyfill](https://www.npmjs.com/package/@mattiasbuelens/web-streams-polyfill/v/0.3.2) has been republished as [web-streams-polyfill](https://www.npmjs.com/package/web-streams-polyfill).
  For the full list of changes between web-streams-polyfill v1.3.2 and this version, [visit the fork's changelog](https://github.com/MattiasBuelens/web-streams-polyfill/blob/v0.3.2/CHANGELOG.md).

* 💥 CommonJS entry points have been moved to `dist/`:
  * `index.js` ➡ `dist/polyfill.js`
  * `index.es6.js` ➡ `dist/polyfill.es6.js`

  However, we recommend migrating to a [variant sub-package](https://github.com/MattiasBuelens/web-streams-polyfill#usage) instead:
  * `require('web-streams-polyfill/index.js')` ➡ `require('web-streams-polyfill')`
  * `require('web-streams-polyfill/index.es6.js')` ➡ `require('web-streams-polyfill/es6')`

* 👓 Align with [spec version `2c8f35e`](https://github.com/whatwg/streams/tree/2c8f35ed23451ffc9b32ec37b56def4a5349abb1/)

* 🏠 Code moved from [creatorrr/web-streams-polyfill](https://github.com/creatorrr/web-streams-polyfill) to [MattiasBuelens/web-streams-polyfill](https://github.com/MattiasBuelens/web-streams-polyfill)
