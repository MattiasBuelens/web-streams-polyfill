# Changelog

> **Tags:**
> - 💥 Breaking Change
> - 👓 Spec Compliancy
> - 🚀 New Feature
> - 🐛 Bug Fix
> - 📝 Documentation
> - 🏠 Internal
> - 💅 Polish

## v0.3.1 (2019-02-25)

* 🐛 Fix ES5 build target ([#9](https://github.com/MattiasBuelens/web-streams-polyfill/pull/9))

## v0.3.0 (2019-02-21)

* 💥 **Breaking change:** The type of `TransformStream<R, W>` is changed to `TransformStream<I, O>` and the meaning of the two type parameters is flipped, to align the polyfill with the built-in type definitions of TypeScript 3.2.
* 🚀 Add `polyfill/es6` variant
* 🐛 Fix memory leak when using streams in a microtask loop in Node.js ([#8](https://github.com/MattiasBuelens/web-streams-polyfill/pull/8))
* 🏠 Switch to TypeScript ([#7](https://github.com/MattiasBuelens/web-streams-polyfill/pull/7))
* 💅 Improve type definitions ([#7](https://github.com/MattiasBuelens/web-streams-polyfill/pull/7))

## v0.2.1 (2018-12-31)

* 🐛 Do not copy `ArrayBuffer` when transferring chunk to readable byte stream ([#3](https://github.com/MattiasBuelens/web-streams-polyfill/issues/3), [#4](https://github.com/MattiasBuelens/web-streams-polyfill/pull/4))
* 👓 Align with [spec version `1116de06e9`](https://github.com/whatwg/streams/tree/1116de06e94bf4406c60b1e766111dfd8bc7bfcd/)

## v0.2.0 (2018-11-15)

* 🐛 Avoid long promise chains in `ReadableStream.pipeTo()` ([whatwg/streams#968](https://github.com/whatwg/streams/pull/968))
* 👓 Align with [spec version `46c3b89dd3`](https://github.com/whatwg/streams/tree/46c3b89dd3aff28b2fc381dd1d397c12b4fb8a16/)

## v0.1.0 (2018-08-15)

* 🚀 Initial release
* 👓 Align with [spec version `78cfd1e22b`](https://github.com/whatwg/streams/tree/78cfd1e22b717ce7e6d3aae4e36de0ef9101356e/)
