# web-streams-polyfill

Web Streams, based on the WHATWG spec reference implementation.  

[![build status](https://api.travis-ci.com/MattiasBuelens/web-streams-polyfill.svg?branch=master)](https://travis-ci.com/MattiasBuelens/web-streams-polyfill)
[![npm version](https://img.shields.io/npm/v/web-streams-polyfill.svg)](https://www.npmjs.com/package/web-streams-polyfill)
[![license](https://img.shields.io/npm/l/web-streams-polyfill.svg)](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/LICENSE)

## Links

 - [Official spec][spec]
 - [Reference implementation][ref-impl]

## Usage

Web Streams are [widely supported][mdn-browser-compatibility] across all modern browsers
(including Chrome, Firefox and Safari) and server runtimes (including Node.js, Deno and Bun),
but most of them still miss a few newer features, such as `ReadableStream.from()` or `transformer.cancel()`.
This library can either fill in just those missing features on top of the built-in implementation,
or provide a complete implementation of its own.

This library comes in multiple variants:

| Variant | What it does | Formats | Targets |
| --- | --- | --- | --- |
| `web-streams-polyfill/auto` | Polyfill. Installs only the [features](#features) that the built-in streams are missing. If the built-in streams are missing or too old to build on, replaces them entirely. | script | ES2018+ |
| `web-streams-polyfill/replace` | Polyfill. Always replaces the built-in stream classes on the global scope with this library's own implementation. | script | ES2015+ |
| `web-streams-polyfill/replace/es5` | Same as `replace`, for older environments. | script | ES5+ |
| `web-streams-polyfill` | [Ponyfill][ponyfill]. Exports this library's own implementation, without changing any globals. | ESM, UMD | ES2015+ |
| `web-streams-polyfill/es5` | Same as the default ponyfill, for older environments. | ESM, UMD | ES5+ |
| `web-streams-polyfill/extend-native` | Ponyfill. Exports subclasses of the built-in stream classes with the missing features added, without changing any globals. Falls back to this library's own implementation if the built-in streams are missing or too old. | ESM, CommonJS | ES2018+ |
| `web-streams-polyfill/feature` | Low-level [feature modules](#feature-modules) that install one feature at a time. | ESM | ES2018+ |

Which one should you use?
* **Web apps** should use `web-streams-polyfill/auto`. Streams keep using the built-in implementation where possible,
  so they keep working with browser APIs such as `fetch()`, `Response`, `CompressionStream` and `postMessage()`.
* **Libraries** should not change the global scope, so they should use a ponyfill.
  Use `web-streams-polyfill/extend-native` if your streams need to work with built-in streams and browser APIs,
  or `web-streams-polyfill` if you need the exact same, fully spec-compliant behavior in every environment.
* Use `web-streams-polyfill/replace` (or `replace/es5`) only if you need this library's own implementation everywhere,
  for example to work around a bug in a built-in implementation. See [the warning below](#compatibility-with-built-in-streams).

Each variant also includes TypeScript type definitions, compatible with the DOM type definitions for streams included in TypeScript.
These type definitions require TypeScript version 5.7 or higher.

In version 5, the polyfill variants were renamed and the `auto`, `extend-native` and `feature` variants were added.
See the [migration guide][migrating] for more information.

Usage as a polyfill through a `<script>` tag:
```html
<!-- option 1: hosted by unpkg CDN -->
<script src="https://unpkg.com/web-streams-polyfill/dist/auto.js"></script>
<!-- option 2: self hosted -->
<script src="/path/to/web-streams-polyfill/dist/auto.js"></script>
<script>
const readable = ReadableStream.from(["a", "b", "c"]);
</script>
```
Usage as a polyfill from within an ES module:
```js
import "web-streams-polyfill/auto";
const readable = ReadableStream.from(["a", "b", "c"]);
```
Usage as a ponyfill from within an ES module:
```js
import { ReadableStream } from "web-streams-polyfill";
const readable = new ReadableStream();
```
Usage as a ponyfill from within a CommonJS module:
```js
const { ReadableStream } = require("web-streams-polyfill");
const readable = new ReadableStream();
```
Usage as a ponyfill on top of the built-in streams:
```js
import { ReadableStream, TransformStream, adopt } from "web-streams-polyfill/extend-native";

const readable = ReadableStream.from(["a", "b", "c"]);
// These are real built-in streams, so they work with browser APIs
const response = new Response(readable.pipeThrough(new TextEncoderStream()));

// Streams created by the browser can be converted in place
const body = adopt((await fetch("/data")).body);
for await (const chunk of body) {
  // ...
}
```

### Compatibility with built-in streams

`web-streams-polyfill/auto` keeps the built-in stream classes whenever they are complete enough to build on:
they must support readable byte streams and `WritableStreamDefaultController.signal`.
This is the case in Chrome 98+, Firefox 102+, Safari 26.4+, Node.js 16.5+, and current versions of Deno and Bun.
It then adds only the features that are missing. Streams created by the browser, such as `Response.body`,
are instances of the same classes, so they get those features too.
Otherwise, it replaces all stream classes, just like `web-streams-polyfill/replace`.
It never mixes the two implementations.

`web-streams-polyfill/extend-native` does the same, but adds the missing features to its own subclasses
instead of to the global classes. Streams that its own methods return (such as the branches of `tee()`,
or the result of `pipeThrough()`) are instances of its subclasses.
Streams created by the browser (such as `Response.body`) are not, so use `adopt(stream)` to convert them in place.
When the built-in streams are not complete enough, it exports this library's own implementation instead,
and `adopt()` throws a `TypeError` for built-in streams.

> [!WARNING]
> **Replacing the built-in streams**
>
> `web-streams-polyfill/replace` *unconditionally* replaces the global `ReadableStream`, `WritableStream`
> and `TransformStream` classes with this library's own implementation.
> However, browser APIs like `fetch()` will still return stream objects using the *built-in* stream classes,
> and they won't accept streams from this library either.
> This can lead to surprising results, for example `Response.body` will not be `instanceof ReadableStream`
> after the polyfill replaces the global `ReadableStream` class.
>
> Prefer `web-streams-polyfill/auto` instead, which keeps the built-in stream classes when possible.
> If you do need to replace them, use `ReadableStream.from()` to convert a built-in stream (e.g. from `fetch()`)
> to a polyfilled stream.

## Features

`web-streams-polyfill/auto` and `web-streams-polyfill/extend-native` can add these features on top of the built-in streams:

| Feature | Module | Missing in |
| --- | --- | --- |
| [`ReadableStream.from()`][rs-from] | `readable-stream-from` | Chrome |
| [Async iteration][rs-asynciterator] (`values()` and `[Symbol.asyncIterator]()`) | `async-iterator` | Safari before 27 |
| [`reader.read(view, { min })`][byob-reader-read] | `byob-read-min` | Safari |
| [`transformer.cancel()`][transformer-cancel] | `transformer-cancel` | Chrome, Firefox, Safari |

Each feature is only installed if the built-in implementation doesn't already support it.
Features are detected by checking their behavior, not by checking the browser version.

A few things work differently when a feature is built on top of the built-in streams:
* A `TransformStream` whose transformer has a `cancel()` method is built from a built-in `ReadableStream` and `WritableStream`
  if the built-in `TransformStream` doesn't support `transformer.cancel()`.
  Its `readable` and `writable` sides can still be transferred with `postMessage()`, but the `TransformStream` itself can't.
  Transfer `{ readable, writable }` instead, which works with `pipeThrough()` just the same.
* With `reader.read(view, { min })`, the underlying byte source sees several smaller BYOB requests instead of a single one.
* Bugs in the built-in implementation are not fixed.
* Stream classes from other realms (such as an `<iframe>` or a worker) are not patched,
  unless the polyfill is loaded there too.

### Feature modules

If you want to choose which features to install, you can use the feature modules directly.
Each feature module exports a `check(classes)` and an `install(classes)` function.
`classes` is the object holding the stream classes, which defaults to `globalThis`.
Importing a feature module has no side effects.

```js
import { install } from "web-streams-polyfill/feature/readable-stream-from";
// Adds ReadableStream.from() to the global ReadableStream, if it's missing
install();
```

`web-streams-polyfill/feature` exports `installAll(classes)`, which installs every missing feature
and reports what it installed. It doesn't install anything if the built-in streams aren't complete enough
to build on (see `isPatchable(classes)`). This is what `web-streams-polyfill/auto` uses, except that
`installAll()` never replaces the built-in streams.

```js
import { installAll } from "web-streams-polyfill/feature";
const { success, installed } = installAll();
if (!success) {
  // The built-in streams are missing or too old, load web-streams-polyfill/replace instead
}
```

The feature modules are only available as ES modules.

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
