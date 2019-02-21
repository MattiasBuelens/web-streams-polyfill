# web-streams-polyfill

Web Streams, based on the WHATWG spec reference implementation.  

[![build status](https://api.travis-ci.com/MattiasBuelens/web-streams-polyfill.svg?branch=master)](https://travis-ci.com/MattiasBuelens/web-streams-polyfill)
[![npm version](https://img.shields.io/npm/v/@mattiasbuelens/web-streams-polyfill.svg)](https://www.npmjs.com/package/@mattiasbuelens/web-streams-polyfill)
[![license](https://img.shields.io/npm/l/@mattiasbuelens/web-streams-polyfill.svg)](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/LICENSE)
[![Join the chat at https://gitter.im/web-streams-polyfill/Lobby](https://badges.gitter.im/web-streams-polyfill/Lobby.svg)](https://gitter.im/web-streams-polyfill/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Links

 - [Official spec][spec]
 - [Reference implementation][ref-impl]

## Usage

This library comes in four variants:
* `@mattiasbuelens/web-streams-polyfill`: a polyfill that replaces the native stream implementations.
  Recommended for use in web apps through a `<script>` tag.
* `@mattiasbuelens/web-streams-polyfill/es6`: a polyfill targeting ES2015+ environments.
  Recommended for use in web apps targeting modern browsers through a `<script>` tag.
* `@mattiasbuelens/web-streams-polyfill/ponyfill`: a [ponyfill] that provides
  the stream implementations without replacing any globals.
  Recommended for use in Node applications or web libraries.
* `@mattiasbuelens/web-streams-polyfill/ponyfill/es6`: a ponyfill targeting ES2015+ environments.
  Recommended for use in modern Node applications, or in web libraries targeting modern browsers.

Each variant also includes TypeScript type definitions, compatible with the DOM type definitions for streams included in TypeScript.

Usage as a polyfill:
```html
<!-- unpkg cdn -->
<script src="https://unpkg.com/@mattiasbuelens/web-streams-polyfill/dist/polyfill.min.js"></script>

<!-- self hosted -->
<script src="/path/to/web-streams-polyfill/dist/polyfill.min.js"></script>
<script>
var readable = new ReadableStream();
</script>
```
Usage as a Node module:
```js
var streams = require("@mattiasbuelens/web-streams-polyfill/ponyfill");
var readable = new streams.ReadableStream();
```
Usage as a ES2015 module:
```js
import { ReadableStream } from "@mattiasbuelens/web-streams-polyfill/ponyfill";
const readable = new ReadableStream();
```

### Compatibility

The `polyfill` and `ponyfill` variants work in any ES5-compatible environment that has a global `Promise`.
If you need to support older browsers or Node versions that do not have a native `Promise` implementation
(check the [support table][promise-support]), you must first include a `Promise` polyfill
(e.g. [promise-polyfill][promise-polyfill]).

The `polyfill/es6` and `ponyfill/es6` variants work in any ES2015-compatible environment.

### Compliance

The polyfill implements [version `1116de06e9` (29 Nov 2018)](https://streams.spec.whatwg.org/commit-snapshots/1116de06e94bf4406c60b1e766111dfd8bc7bfcd/) of the streams specification.

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
[creatorrr-polyfill]: https://github.com/creatorrr/web-streams-polyfill
