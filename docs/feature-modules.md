# Feature modules

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

See the [README](../README.md#features) for the list of features and their module names.
