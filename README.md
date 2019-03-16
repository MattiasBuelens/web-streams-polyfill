# web-streams-polyfill

Web Streams, based on the WHATWG spec reference implementation.  

[![build status](https://api.travis-ci.com/MattiasBuelens/web-streams-polyfill.svg?branch=master)](https://travis-ci.com/MattiasBuelens/web-streams-polyfill)
[![npm version](https://img.shields.io/npm/v/web-streams-polyfill.svg)](https://www.npmjs.com/package/web-streams-polyfill)
[![license](https://img.shields.io/npm/l/web-streams-polyfill.svg)](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/LICENSE)
[![Join the chat at https://gitter.im/web-streams-polyfill/Lobby](https://badges.gitter.im/web-streams-polyfill/Lobby.svg)](https://gitter.im/web-streams-polyfill/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Links

 - [Official spec][spec]
 - [Reference implementation][ref-impl]

## Usage

This library comes in multiple variants:
* `web-streams-polyfill`: a polyfill that replaces the native stream implementations.
  Recommended for use in web apps supporting older browsers through a `<script>` tag.
* `web-streams-polyfill/es6`: a polyfill targeting ES2015+ environments.
  Recommended for use in web apps supporting modern browsers through a `<script>` tag.
* `web-streams-polyfill/es2018`: a polyfill targeting ES2018+ environments.
* `web-streams-polyfill/ponyfill`: a [ponyfill] that provides
  the stream implementations without replacing any globals.
  Recommended for use in legacy Node applications, or in web libraries supporting older browsers.
* `web-streams-polyfill/ponyfill/es6`: a ponyfill targeting ES2015+ environments.
  Recommended for use in Node 6+ applications, or in web libraries supporting modern browsers.
* `web-streams-polyfill/ponyfill/es2018`: a ponyfill targeting ES2018+ environments.
  Recommended for use in Node 10+ applications.

Each variant also includes TypeScript type definitions, compatible with the DOM type definitions for streams included in TypeScript.

Usage as a polyfill:
```html
<!-- option 1: hosted by unpkg CDN -->
<script src="https://unpkg.com/web-streams-polyfill/dist/polyfill.min.js"></script>
<!-- option 2: self hosted -->
<script src="/path/to/web-streams-polyfill/dist/polyfill.min.js"></script>
<script>
var readable = new ReadableStream();
</script>
```
Usage as a Node module:
```js
var streams = require("web-streams-polyfill/ponyfill");
var readable = new streams.ReadableStream();
```
Usage as a ES2015 module:
```js
import { ReadableStream } from "web-streams-polyfill/ponyfill";
const readable = new ReadableStream();
```

### Compatibility

The `polyfill` and `ponyfill` variants work in any ES5-compatible environment that has a global `Promise`.
If you need to support older browsers or Node versions that do not have a native `Promise` implementation
(check the [support table][promise-support]), you must first include a `Promise` polyfill
(e.g. [promise-polyfill][promise-polyfill]).

The `polyfill/es6` and `ponyfill/es6` variants work in any ES2015-compatible environment.

The `polyfill/es2018` and `ponyfill/es2018` variants work in any ES2018-compatible environment.

[Async iterable support for `ReadableStream`][rs-asynciterator] is available in all variants, but requires an ES2018-compatible environment or a polyfill for `Symbol.asyncIterator`.

### Compliance

The polyfill implements [version `2c8f35e` (21 Feb 2019)][spec-snapshot] of the streams specification.

The polyfill is tested against the same [web platform tests][wpt] that are used by browsers to test their native implementations. The polyfill aims to pass all tests, although it allows some exceptions for practical reasons:
* The `es2018` variant passes all of the tests, except for the [detached buffer tests for readable byte streams][wpt-detached-buffer].
  These tests require the implementation to synchronously transfer the contents of an `ArrayBuffer`, which is not yet possible from JavaScript (although there is a [proposal][proposal-arraybuffer-transfer] to make it possible).
  The reference implementation "cheats" on these tests [by making a copy instead][ref-impl-transferarraybuffer], but that is unacceptable for the polyfill's performance ([#3][issue-3]).
* The `es6` variant passes the same tests as the `es2018` variant, except for the [test for the prototype of `ReadableStream`'s async iterator][wpt-async-iterator-prototype].
  Retrieving the correct `%AsyncIteratorPrototype%` requires using an async generator (`async function* () {}`), which is invalid syntax before ES2018.
  Instead, the polyfill [creates its own version][stub-async-iterator-prototype] which is functionally equivalent to the real prototype.

The type definitions are compatible with the built-in stream types of TypeScript 3.3.

### Contributors

Thanks to these people for their work on [the original polyfill][creatorrr-polyfill]:

 - Diwank Singh Tomer ([creatorrr](https://github.com/creatorrr))
 - Anders Riutta ([ariutta](https://github.com/ariutta))

[spec]: https://streams.spec.whatwg.org
[ref-impl]: https://github.com/whatwg/streams
[ponyfill]: https://github.com/sindresorhus/ponyfill
[promise-support]: https://kangax.github.io/compat-table/es6/#test-Promise
[promise-polyfill]: https://www.npmjs.com/package/promise-polyfill
[rs-asynciterator]: https://streams.spec.whatwg.org/#rs-asynciterator
[spec-snapshot]: https://streams.spec.whatwg.org/commit-snapshots/2c8f35ed23451ffc9b32ec37b56def4a5349abb1/
[wpt]: https://github.com/web-platform-tests/wpt/tree/de6f8fcf9b87e80811e9267a886cf891f6f864e0/streams
[wpt-detached-buffer]: https://github.com/web-platform-tests/wpt/blob/de6f8fcf9b87e80811e9267a886cf891f6f864e0/streams/readable-byte-streams/detached-buffers.any.js
[proposal-arraybuffer-transfer]: https://github.com/domenic/proposal-arraybuffer-transfer
[ref-impl-transferarraybuffer]: https://github.com/whatwg/streams/blob/2c8f35ed23451ffc9b32ec37b56def4a5349abb1/reference-implementation/lib/helpers.js#L119
[issue-3]: https://github.com/MattiasBuelens/web-streams-polyfill/issues/3
[wpt-async-iterator-prototype]: https://github.com/web-platform-tests/wpt/blob/de6f8fcf9b87e80811e9267a886cf891f6f864e0/streams/readable-streams/async-iterator.any.js#L17
[stub-async-iterator-prototype]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/v2.0.0/src/target/es5/stub/async-iterator-prototype.ts
[creatorrr-polyfill]: https://github.com/creatorrr/web-streams-polyfill
