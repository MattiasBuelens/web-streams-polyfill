# web-streams-polyfill

Web Streams, based on the WHATWG spec reference implementation.  

[![build status](https://api.travis-ci.com/MattiasBuelens/web-streams-polyfill.svg?branch=master)](https://travis-ci.com/MattiasBuelens/web-streams-polyfill)
[![npm version](https://img.shields.io/npm/v/web-streams-polyfill.svg)](https://www.npmjs.com/package/web-streams-polyfill)
[![license](https://img.shields.io/npm/l/web-streams-polyfill.svg)](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/LICENSE)

## Links

 - [Official spec][spec]
 - [Reference implementation][ref-impl]

## Usage

This library comes in multiple variants:
* `web-streams-polyfill`: a [ponyfill] that provides the stream implementations 
  without replacing any globals, targeting ES2015+ environments.
  Recommended for use in Node 6+ applications, or in web libraries supporting modern browsers.
* `web-streams-polyfill/es5`: a ponyfill targeting ES5+ environments.
  Recommended for use in legacy Node applications, or in web libraries supporting older browsers.
* `web-streams-polyfill/polyfill`: a polyfill that replaces the native stream implementations,
  targeting ES2015+ environments.
  Recommended for use in web apps supporting modern browsers through a `<script>` tag.
* `web-streams-polyfill/polyfill/es5`: a polyfill targeting ES5+ environments.
  Recommended for use in web apps supporting older browsers through a `<script>` tag.

Each variant also includes TypeScript type definitions, compatible with the DOM type definitions for streams included in TypeScript.
These type definitions require TypeScript version 4.7 or higher.

In version 4, the list of variants was reworked to have more modern defaults and to reduce the download size of the package.
See the [migration guide][migrating] for more information.

Usage as a polyfill:
```html
<!-- option 1: hosted by unpkg CDN -->
<script src="https://unpkg.com/web-streams-polyfill/dist/polyfill.js"></script>
<!-- option 2: self hosted -->
<script src="/path/to/web-streams-polyfill/dist/polyfill.js"></script>
<script>
var readable = new ReadableStream();
</script>
```
Usage as a Node module:
```js
var streams = require("web-streams-polyfill");
var readable = new streams.ReadableStream();
```
Usage as a ponyfill from within a ES2015 module:
```js
import { ReadableStream } from "web-streams-polyfill";
const readable = new ReadableStream();
```
Usage as a polyfill from within an ES2015 module:
```js
import "web-streams-polyfill/polyfill";
const readable = new ReadableStream();
```

## Compatibility

The `polyfill` and `ponyfill` variants work in any ES2015-compatible environment.

The `polyfill/es5` and `ponyfill/es5` variants work in any ES5-compatible environment that has a global `Promise`.
If you need to support older browsers or Node versions that do not have a native `Promise` implementation
(check the [support table][promise-support]), you must first include a `Promise` polyfill
(e.g. [promise-polyfill][promise-polyfill]).

[Async iterable support for `ReadableStream`][rs-asynciterator] is available in all variants, but requires an ES2018-compatible environment or a polyfill for `Symbol.asyncIterator`.

[`WritableStreamDefaultController.signal`][ws-controller-signal] is available in all variants, but requires a global `AbortController` constructor. If necessary, consider using a polyfill such as [abortcontroller-polyfill].

[Reading with a BYOB reader][mdn-byob-read] is available in all variants, but requires `ArrayBuffer.prototype.transfer()` or `structuredClone()` to exist in order to correctly transfer the given view's buffer. If not available, then the buffer won't be transferred during the read.

### Tooling compatibility

This package uses [subpath exports](https://nodejs.org/api/packages.html#subpath-exports) for its variants. As such, you need Node 12 or higher in order to `import` or `require()` such a variant.

When using TypeScript, make sure your [`moduleResolution`](https://www.typescriptlang.org/tsconfig#moduleResolution) is set to `"node16"`, `"nodenext"` or `"bundler"`.

## Compliance

The polyfill implements [version `4dc123a` (13 Nov 2023)][spec-snapshot] of the streams specification.

The polyfill is tested against the same [web platform tests][wpt] that are used by browsers to test their native implementations.
The polyfill aims to pass all tests, although it allows some exceptions for practical reasons:
* The default (ES2015) variant passes all of the tests, except for the [test for the prototype of `ReadableStream`'s async iterator][wpt-async-iterator-prototype].
  Retrieving the correct `%AsyncIteratorPrototype%` requires using an async generator (`async function* () {}`), which is invalid syntax before ES2018.
  Instead, the polyfill [creates its own version][stub-async-iterator-prototype] which is functionally equivalent to the real prototype.
* The ES5 variant passes the same tests as the ES2015 variant, except for various tests about specific characteristics of the constructors, properties and methods.
  These test failures do not affect the run-time behavior of the polyfill.
  For example:
  * The `name` property of down-leveled constructors is incorrect.
  * The `length` property of down-leveled constructors and methods with optional arguments is incorrect.
  * Not all properties and methods are correctly marked as non-enumerable.
  * Down-leveled class methods are not correctly marked as non-constructable.

## Contributors

Thanks to these people for their work on [the original polyfill][creatorrr-polyfill]:

 - Diwank Singh Tomer ([creatorrr](https://github.com/creatorrr))
 - Anders Riutta ([ariutta](https://github.com/ariutta))

[spec]: https://streams.spec.whatwg.org
[ref-impl]: https://github.com/whatwg/streams
[ponyfill]: https://github.com/sindresorhus/ponyfill
[migrating]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/MIGRATING.md
[promise-support]: https://kangax.github.io/compat-table/es6/#test-Promise
[promise-polyfill]: https://www.npmjs.com/package/promise-polyfill
[rs-asynciterator]: https://streams.spec.whatwg.org/#rs-asynciterator
[ws-controller-signal]: https://streams.spec.whatwg.org/#ws-default-controller-signal
[abortcontroller-polyfill]: https://www.npmjs.com/package/abortcontroller-polyfill
[mdn-byob-read]: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamBYOBReader/read
[spec-snapshot]: https://streams.spec.whatwg.org/commit-snapshots/4dc123a6e7f7ba89a8c6a7975b021156f39cab52/
[wpt]: https://github.com/web-platform-tests/wpt/tree/2a298b616b7c865917d7198a287310881cbfdd8d/streams
[wpt-async-iterator-prototype]: https://github.com/web-platform-tests/wpt/blob/2a298b616b7c865917d7198a287310881cbfdd8d/streams/readable-streams/async-iterator.any.js#L24
[stub-async-iterator-prototype]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/v4.0.0/src/lib/readable-stream/async-iterator.ts#L143-L147
[creatorrr-polyfill]: https://github.com/creatorrr/web-streams-polyfill
