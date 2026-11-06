# Working with built-in streams

## How `auto` builds on the built-in streams

`web-streams-polyfill/auto` keeps the built-in stream classes whenever they are complete enough to build on:
they must support `pipeTo()` and `WritableStreamDefaultController.signal`.
This is the case in Chrome 98+, Firefox 102+, Safari 16.4+, Node.js 16.5+, and current versions of Deno and Bun.
It then adds only the features that are missing. Streams created by the browser, such as `Response.body`,
are instances of the same classes, so they get those features too.
Otherwise, it replaces all stream classes, just like `web-streams-polyfill/replace`.
It never mixes the two implementations.

## `extend-native` and `adopt()`

`web-streams-polyfill/extend-native` does the same, but adds the missing features to its own subclasses
instead of to the global classes. Streams that its own methods return (such as the branches of `tee()`,
or the result of `pipeThrough()`) are instances of its subclasses.
Streams created by the browser (such as `Response.body`) are not, so use `adopt(stream)` to convert them in place.
Instances of other subclasses of the built-in classes (such as a `FileSystemWritableFileStream`) are returned unchanged,
since changing their prototype would lose their own methods.
When the built-in streams are not complete enough, it exports this library's own implementation instead,
and `adopt()` throws a `TypeError` for built-in streams.

## Differences from the built-in streams

A few things work differently when a feature is built on top of the built-in streams:
* A `TransformStream` whose transformer has a `cancel()` method is built from a built-in `ReadableStream` and `WritableStream`
  if the built-in `TransformStream` doesn't support `transformer.cancel()`.
  Its `readable` and `writable` sides can still be transferred with `postMessage()`, but the `TransformStream` itself can't.
  Transfer `{ readable, writable }` instead, which works with `pipeThrough()` just the same.
* With `reader.read(view, { min })`, the underlying byte source sees several smaller BYOB requests instead of a single one.
* A byte stream built on top of the built-in streams is a built-in `ReadableStream` with a default source,
  which reads its chunks from this library's own byte stream. Platform APIs (such as `Response`) read it like any other stream,
  but they can only read it with a default reader, and `postMessage()` transfers it as a stream without a byte source.
  Byte streams created by the browser (such as `Response.body`) still don't support BYOB readers.
* Bugs in the built-in implementation are not fixed.
  For example, `releaseLock()` on a default reader throws if there are pending reads in Chrome before 105
  and Safari before 17, instead of rejecting those reads. This also applies to default readers of byte streams
  built on top of the built-in streams (but not to their BYOB readers).
* Stream classes from other realms (such as an `<iframe>` or a worker) are not patched,
  unless the polyfill is loaded there too.

## Replacing the built-in streams

> [!WARNING]
> `web-streams-polyfill/replace` *unconditionally* replaces the global `ReadableStream`, `WritableStream`
> and `TransformStream` classes with this library's own implementation.
> However, browser APIs like `fetch()` will still return stream objects using the *built-in* stream classes,
> and they won't accept streams from this library either.
> This can lead to surprising results, for example `Response.body` will not be `instanceof ReadableStream`
> after the polyfill replaces the global `ReadableStream` class.
>
> Prefer `web-streams-polyfill/auto` instead, which keeps the built-in stream classes when possible.
> If you do need to replace them, see [Converting built-in streams](converting-built-in-streams.md).
