# web-streams-polyfill

Web Streams, based on the WHATWG spec reference implementation.

[![test status](https://github.com/MattiasBuelens/web-streams-polyfill/actions/workflows/test.yml/badge.svg)](https://github.com/MattiasBuelens/web-streams-polyfill/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/web-streams-polyfill.svg)](https://www.npmjs.com/package/web-streams-polyfill)
[![license](https://img.shields.io/npm/l/web-streams-polyfill.svg)](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/LICENSE)

Web Streams are [widely supported][mdn-browser-compatibility] across all modern browsers
(including Chrome, Firefox and Safari) and server runtimes (including Node.js, Deno and Bun),
but most of them still miss a few newer features, such as `ReadableStream.from()` or `transformer.cancel()`.
This library can either fill in just those missing features on top of the built-in implementation,
or provide a complete implementation of its own.

* [Official spec][spec]
* [Reference implementation][ref-impl]
* [Migrating from version 4][migrating]

## Quick start

For a web app, load `web-streams-polyfill/auto`. It adds the missing features to the built-in streams,
so streams from browser APIs such as `fetch()` get them too:

```js
import "web-streams-polyfill/auto";

const response = await fetch("/data");
for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
  // ...
}
```

Or through a `<script>` tag:

```html
<!-- option 1: hosted by unpkg CDN -->
<script src="https://unpkg.com/web-streams-polyfill/dist/auto.js"></script>
<!-- option 2: self hosted -->
<script src="/path/to/web-streams-polyfill/dist/auto.js"></script>
<script>
const readable = ReadableStream.from(["a", "b", "c"]);
</script>
```

For a library, use a [ponyfill][ponyfill] that doesn't change any globals.
`web-streams-polyfill/extend-native` exports subclasses of the built-in streams with the missing features added:

```js
import { ReadableStream, adopt } from "web-streams-polyfill/extend-native";

const readable = ReadableStream.from(["a", "b", "c"]);
// These are real built-in streams, so they work with browser APIs
const response = new Response(readable.pipeThrough(new TextEncoderStream()));

// Streams created by the browser can be converted in place
const body = adopt((await fetch("/data")).body);
```

`web-streams-polyfill` exports this library's own, fully spec-compliant implementation:

```js
import { ReadableStream } from "web-streams-polyfill";
const readable = new ReadableStream();
```

```js
const { ReadableStream } = require("web-streams-polyfill");
const readable = new ReadableStream();
```

## Which variant should I use?

| Variant | What it does | Formats | Targets |
| --- | --- | --- | --- |
| `web-streams-polyfill/auto` | Polyfill. Installs only the [features](#features) that the built-in streams are missing. If the built-in streams are missing or too old to build on, replaces them entirely. | script | ES2018+ |
| `web-streams-polyfill/replace` | Polyfill. Always replaces the built-in stream classes on the global scope with this library's own implementation. | script | ES2015+ |
| `web-streams-polyfill/replace/es5` | Same as `replace`, for older environments. | script | ES5+ |
| `web-streams-polyfill` | Ponyfill. Exports this library's own implementation, without changing any globals. | ESM, UMD | ES2015+ |
| `web-streams-polyfill/es5` | Same as the default ponyfill, for older environments. | ESM, UMD | ES5+ |
| `web-streams-polyfill/extend-native` | Ponyfill. Exports subclasses of the built-in stream classes with the missing features added, without changing any globals. Falls back to this library's own implementation if the built-in streams are missing or too old. | ESM, CommonJS | ES2018+ |
| `web-streams-polyfill/feature` | Low-level [feature modules][feature-modules] that install one feature at a time. | ESM | ES2018+ |

* **Web apps** should use `web-streams-polyfill/auto`. Streams keep using the built-in implementation where possible,
  so they keep working with browser APIs such as `fetch()`, `Response`, `CompressionStream` and `postMessage()`.
* **Libraries** should not change the global scope, so they should use a ponyfill.
  Use `web-streams-polyfill/extend-native` if your streams need to work with built-in streams and browser APIs,
  or `web-streams-polyfill` if you need the exact same, fully spec-compliant behavior in every environment.
* Use `web-streams-polyfill/replace` (or `replace/es5`) only if you need this library's own implementation everywhere,
  for example to work around a bug in a built-in implementation.
  Streams from browser APIs then use different classes, see [Working with built-in streams][built-in-streams].

Each variant also includes TypeScript type definitions, compatible with the DOM type definitions for streams included in TypeScript.
These type definitions require TypeScript version 5.7 or higher.

## Features

`web-streams-polyfill/auto` and `web-streams-polyfill/extend-native` can add these features on top of the built-in streams:

| Feature | Module | Missing in |
| --- | --- | --- |
| [Readable byte streams][rbs] and BYOB readers | `readable-byte-streams` | Safari before 26.4 |
| [`ReadableStream.from()`][rs-from] | `readable-stream-from` | Chrome |
| [Async iteration][rs-asynciterator] (`values()` and `[Symbol.asyncIterator]()`) | `async-iterator` | Safari before 27 |
| [`reader.read(view, { min })`][byob-reader-read] | `byob-read-min` | Safari |
| [`transformer.cancel()`][transformer-cancel] | `transformer-cancel` | Chrome, Firefox, Safari |

Each feature is only installed if the built-in implementation doesn't already support it.
Features are detected by checking their behavior, not by checking the browser version.
A few things work differently when a feature is built on top of the built-in streams,
see [Working with built-in streams][built-in-streams].
To choose which features to install yourself, use the [feature modules][feature-modules].

## Documentation

* [Working with built-in streams][built-in-streams]: how `auto` and `extend-native` build on the built-in streams,
  what works differently, and what to watch out for when replacing them.
* [Converting built-in streams][converting]: how to use built-in streams (e.g. from `fetch()`)
  with `replace` and the ponyfills.
* [Feature modules][feature-modules]: installing individual features.
* [Migration guide][migrating]: upgrading from an earlier version.

## Compatibility

The `replace` and `ponyfill` variants work in any ES2015-compatible environment.

The `replace/es5` and `es5` variants work in any ES5-compatible environment that has a global `Promise`.
If you need to support older browsers or Node versions that do not have a native `Promise` implementation
(check the [support table][promise-support]), you must first include a `Promise` polyfill
(e.g. [promise-polyfill][promise-polyfill]).

The `auto`, `extend-native` and `feature` variants work in any ES2018-compatible environment.
Every environment that has built-in streams complete enough to build on also supports ES2018.

[Async iterable support for `ReadableStream`][rs-asynciterator] is available in all variants, but requires an ES2018-compatible environment or a polyfill for `Symbol.asyncIterator`.

[`WritableStreamDefaultController.signal`][ws-controller-signal] is available in all variants, but requires a global `AbortController` constructor. If necessary, consider using a polyfill such as [abortcontroller-polyfill].

[Reading with a BYOB reader][mdn-byob-read] is available in all variants, but requires `ArrayBuffer.prototype.transfer()` or `structuredClone()` to exist in order to correctly transfer the given view's buffer. If not available, then the buffer won't be transferred during the read.

### Tooling compatibility

This package uses [subpath exports](https://nodejs.org/api/packages.html#subpath-exports) for its variants. As such, you need Node 12 or higher in order to `import` or `require()` such a variant.

When using TypeScript, make sure your [`moduleResolution`](https://www.typescriptlang.org/tsconfig#moduleResolution) is set to `"node16"`, `"nodenext"` or `"bundler"`.

## Compliance

The polyfill implements [version `080852c` (3 Apr 2025)][spec-snapshot] of the streams specification.

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

The `auto` and `extend-native` variants are also tested against the same tests, on top of the built-in streams
of Chrome, Firefox, Safari (WebKit) and Node.js. They must pass every test that the built-in implementation passes on its own.
A few tests inspect details that only exist inside the built-in implementation, such as the exact BYOB requests
seen by the underlying byte source. These are replaced by [modified versions][wpt-modified]
that check the same behavior without relying on those details.

## Contributors

Thanks to these people for their work on [the original polyfill][creatorrr-polyfill]:

 - Diwank Singh Tomer ([creatorrr](https://github.com/creatorrr))
 - Anders Riutta ([ariutta](https://github.com/ariutta))

[spec]: https://streams.spec.whatwg.org
[ref-impl]: https://github.com/whatwg/streams
[mdn-browser-compatibility]: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API#browser_compatibility
[ponyfill]: https://github.com/sindresorhus/ponyfill
[migrating]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/MIGRATING.md
[promise-support]: https://kangax.github.io/compat-table/es6/#test-Promise
[promise-polyfill]: https://www.npmjs.com/package/promise-polyfill
[rs-asynciterator]: https://streams.spec.whatwg.org/#rs-asynciterator
[ws-controller-signal]: https://streams.spec.whatwg.org/#ws-default-controller-signal
[rbs]: https://streams.spec.whatwg.org/#readablebytestreamcontroller
[rs-from]: https://streams.spec.whatwg.org/#rs-from
[byob-reader-read]: https://streams.spec.whatwg.org/#byob-reader-read
[transformer-cancel]: https://streams.spec.whatwg.org/#dom-transformer-cancel
[wpt-modified]: https://github.com/MattiasBuelens/web-streams-polyfill/tree/master/test/wpt/modified
[abortcontroller-polyfill]: https://www.npmjs.com/package/abortcontroller-polyfill
[mdn-byob-read]: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamBYOBReader/read
[spec-snapshot]: https://streams.spec.whatwg.org/commit-snapshots/080852ccd709e063cc6af239ae07fc040e365179/
[wpt]: https://github.com/web-platform-tests/wpt/tree/ed5926bf7261f8fcd1716f1831c9480958784a5a/streams
[wpt-async-iterator-prototype]: https://github.com/web-platform-tests/wpt/blob/ed5926bf7261f8fcd1716f1831c9480958784a5a/streams/readable-streams/async-iterator.any.js#L24
[stub-async-iterator-prototype]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/v4.0.0/src/lib/readable-stream/async-iterator.ts#L143-L147
[creatorrr-polyfill]: https://github.com/creatorrr/web-streams-polyfill
[built-in-streams]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/docs/built-in-streams.md
[converting]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/docs/converting-built-in-streams.md
[feature-modules]: https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/docs/feature-modules.md
