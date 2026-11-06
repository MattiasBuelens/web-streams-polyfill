# Converting built-in streams

When `web-streams-polyfill/auto`, `web-streams-polyfill/feature` or `web-streams-polyfill/extend-native`
build on the built-in streams, those can be used as they are (with `extend-native`, call `adopt(stream)` first).
But `web-streams-polyfill/replace` and the ponyfill variants (as well as `auto` and `extend-native`
when they fall back to this library's own implementation) use separate stream classes,
which don't accept built-in streams. For example, `pipeTo()` and `pipeThrough()` throw a `TypeError`
when given a built-in `WritableStream` or `TransformStream`, such as `new CompressionStream("gzip")`.

Use `ReadableStream.from()` to convert a built-in `ReadableStream` (e.g. from `fetch()`) to a polyfilled stream:

```js
import { ReadableStream } from "web-streams-polyfill";
const response = await fetch("https://example.com/");
const readable = ReadableStream.from(response.body);
```

There is no `from()` for other streams, but you can wrap them yourself.
A built-in `WritableStream` can be wrapped in a polyfilled `WritableStream` that writes to it:

```js
import { WritableStream } from "web-streams-polyfill";

function fromNativeWritable(nativeWritable) {
  const writer = nativeWritable.getWriter();
  return new WritableStream({
    start(controller) {
      writer.closed.catch(reason => controller.error(reason));
    },
    write(chunk) {
      return writer.write(chunk);
    },
    close() {
      return writer.close();
    },
    abort(reason) {
      return writer.abort(reason);
    }
  });
}
```

A built-in `TransformStream` can be converted by converting both of its sides.
`pipeThrough()` accepts any `{ readable, writable }` pair:

```js
function fromNativeTransform(nativeTransform) {
  return {
    writable: fromNativeWritable(nativeTransform.writable),
    readable: ReadableStream.from(nativeTransform.readable)
  };
}

const compressed = readable.pipeThrough(fromNativeTransform(new CompressionStream("gzip")));
```

`ReadableStream.from()` always creates a default stream, so you can't read from it with a BYOB reader.
To read a built-in stream of bytes with a BYOB reader, wrap it in a polyfilled readable byte stream:

```js
function fromNativeByteStream(nativeReadable) {
  const reader = nativeReadable.getReader();
  return new ReadableStream({
    type: "bytes",
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        controller.byobRequest?.respond(0);
      } else {
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}
```

For a more complete solution, use [web-streams-adapter][web-streams-adapter].
It converts readable (including byte streams), writable and transform streams in both directions,
for example to pass a polyfilled stream to a browser API that only accepts built-in streams.

[web-streams-adapter]: https://github.com/MattiasBuelens/web-streams-adapter
