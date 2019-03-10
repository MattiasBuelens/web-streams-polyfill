# Changelog

> **Tags:**
> - 💥 Breaking Change
> - 👓 Spec Compliance
> - 🚀 New Feature
> - 🐛 Bug Fix
> - 📝 Documentation
> - 🏠 Internal
> - 💅 Polish

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
