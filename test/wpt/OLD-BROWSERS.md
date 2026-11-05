# Running the WPT on older browsers

CI runs the web platform tests against the browsers of the installed Playwright release only.
`web-streams-polyfill/auto` and `web-streams-polyfill/extend-native` also build on top of much older browsers,
down to the oldest versions that pass `isPatchable()`: Chrome 98, Firefox 102 and Safari 16.4.
This document explains how to run the tests against those versions by hand, and records the results of the last run.

These runs are not part of CI: the old browser builds need extra setup, and are only tested occasionally.

## Setup

The browser runner (`test/wpt/browser/run.mjs`) supports two environment variables for this:

* `WPT_BROWSER_EXECUTABLE_PATH`: the browser executable to launch instead of Playwright's own build.
  This only works for Chromium, since Playwright can only drive its own patched builds of Firefox and WebKit.
* `WPT_PLAYWRIGHT_MODULE`: the path to the entry module (`index.mjs`) of another `playwright-core` release.
  Each Playwright release can only drive the Firefox and WebKit builds that it shipped with,
  so we use an older release to get an older Firefox or WebKit.

Install the old Playwright releases and their browsers outside of this repository,
so they don't touch this project's `node_modules` or Playwright's browser cache:

```sh
OLD=~/old-browsers
mkdir -p $OLD && cd $OLD

# Firefox 102: Playwright 1.24
mkdir pw-1.24 && (cd pw-1.24 && npm init -y && npm install playwright-core@1.24.0)
PLAYWRIGHT_BROWSERS_PATH=$OLD/browsers node pw-1.24/node_modules/playwright-core/cli.js install firefox

# WebKit 16.4: Playwright 1.33
mkdir pw-1.33 && (cd pw-1.33 && npm init -y && npm install playwright-core@1.33.0)
PLAYWRIGHT_BROWSERS_PATH=$OLD/browsers node pw-1.33/node_modules/playwright-core/cli.js install webkit

# Chrome 98: a Chromium snapshot build (98.0.4758.0)
curl -LO https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/950370/chrome-linux.zip
unzip chrome-linux.zip
```

Use each release's own `cli.js` to install its browsers. (`npx playwright-core install` may pick a different release.)

### Linux dependencies

These instructions were tested on Ubuntu 24.04.

* Firefox 102 needs `libdbus-glib-1-2` (`sudo apt-get install libdbus-glib-1-2`).
* WebKit 16.4 was built for Ubuntu 22.04, and needs a few libraries that Ubuntu 24.04 no longer has.
  Copy them from the Ubuntu 22.04 packages into the WebKit build's `lib` folder:

  ```sh
  cd $OLD
  for deb in \
    pool/main/i/icu/libicu70_70.1-2_amd64.deb \
    pool/main/libv/libvpx/libvpx7_1.11.0-2ubuntu2_amd64.deb \
    pool/main/p/pcre3/libpcre3_8.39-13ubuntu0.22.04.1_amd64.deb \
    pool/main/libs/libsoup2.4/libsoup2.4-1_2.74.2-3_amd64.deb; do
    curl -LO "http://archive.ubuntu.com/ubuntu/$deb"
    dpkg-deb -x "$(basename $deb)" jammy-libs
  done
  WPE=$OLD/browsers/webkit-1837/minibrowser-wpe
  cp -a jammy-libs/lib/x86_64-linux-gnu/* jammy-libs/usr/lib/x86_64-linux-gnu/* $WPE/lib/
  ```

  The build also bundles GLib 2.70 in `sys/lib`, which is too old for the system's GStreamer and udev libraries
  (`undefined symbol: g_once_init_enter_pointer`). Move it out of the way, so the system's GLib is used instead:

  ```sh
  mkdir -p $WPE/sys-unused
  mv $WPE/sys/lib/libglib-2.0.so* $WPE/sys/lib/libgio-2.0.so* $WPE/sys/lib/libgobject-2.0.so* $WPE/sys/lib/libgmodule-2.0.so* $WPE/sys-unused/
  ```

* Chromium 98 runs as-is.

## Running the tests

Build the library first (`npm run build`). Then run the native and patched modes for each browser.

```sh
# Chrome 98
export WPT_BROWSER_EXECUTABLE_PATH=$OLD/chrome-linux/chrome
node test/wpt/browser/run.mjs --native --browser chromium --update-expectations
node test/wpt/browser/run.mjs --patched --browser chromium --update-expectations
unset WPT_BROWSER_EXECUTABLE_PATH

# Firefox 102
export PLAYWRIGHT_BROWSERS_PATH=$OLD/browsers
WPT_PLAYWRIGHT_MODULE=$OLD/pw-1.24/node_modules/playwright-core/index.mjs node test/wpt/browser/run.mjs --native --browser firefox --update-expectations
WPT_PLAYWRIGHT_MODULE=$OLD/pw-1.24/node_modules/playwright-core/index.mjs node test/wpt/browser/run.mjs --patched --browser firefox --update-expectations

# WebKit 16.4
WPT_PLAYWRIGHT_MODULE=$OLD/pw-1.33/node_modules/playwright-core/index.mjs node test/wpt/browser/run.mjs --native --browser webkit --update-expectations
WPT_PLAYWRIGHT_MODULE=$OLD/pw-1.33/node_modules/playwright-core/index.mjs node test/wpt/browser/run.mjs --patched --browser webkit --update-expectations
unset PLAYWRIGHT_BROWSERS_PATH
```

Always run `--native` before `--patched` for the same browser.
With `--update-expectations`, the patched run compares its failures against the native run's,
and fails if any test fails only when patched. That is the check we care about.

The runs overwrite the recorded expectations of the current browsers in `test/wpt/expectations/`.
Copy the files you want to keep, and then restore the originals: **never commit them**.

```sh
git checkout test/wpt/expectations/
```

`--patched` loads `dist/auto.js`, which installs exactly the features that the browser is missing.
In particular, on WebKit 16.4 this installs the `readable-byte-streams` feature, since it has no byte streams.

## Results

Last run: 2026-11-05, on the `v5` branch with byte streams on top of native streams
([#254](https://github.com/MattiasBuelens/web-streams-polyfill/pull/254)).

| Browser | Playwright | Native | Patched | Fails only when patched |
| --- | --- | --- | --- | --- |
| Chrome 98.0.4758.0 | 1.64.1 (current), with a Chromium snapshot (950370) | 1213 passed, 187 failed | 1319 passed, 79 failed | none |
| Firefox 102.0 | 1.24.0 | 1280 passed, 121 failed | 1387 passed, 12 failed | none |
| WebKit 16.4 | 1.33.0 | 993 passed, 392 failed | 1374 passed, 26 failed | none |

Every test that still fails when patched also fails natively. These are bugs in the old browser that we don't fix:

* **Chrome 98**
  * `releaseLock()` with pending reads throws instead of rejecting those reads (fixed in Chrome 105).
    This accounts for most of the failures in `readable-byte-streams/general`, `readable-byte-streams/tee`,
    `readable-streams/tee`, `readable-streams/default-reader` and the templated tests.
  * The test page for `piping/error-propagation-backward.any.html` crashes, both natively and when patched.
  * Byte streams: `enqueue()`, `respond()` and `respondWithNewView()` don't throw for a detached buffer.
  * `idlharness`: attribute getters and operations that don't match WebIDL.
* **Firefox 102**
  * Byte streams: `enqueue()`, `respond()` and `respondWithNewView()` don't throw for a detached buffer.
  * `readable-streams/bad-strategies.any.html` throws an unexpected harness error,
    and `writable-streams/crashtests/garbage-collection.any.html` fails.
  * TransformStream timing after `readable.cancel()`, and `piping/abort.any.html`: these also fail on current Firefox.
* **WebKit 16.4**
  * `idlharness`: attribute getters on the prototypes don't throw for the wrong receiver.
  * `WritableStreamDefaultController.signal` is not aborted synchronously, and recursive aborts.
  * Byte streams (installed by this library): 6 tests about detached buffers.
    Safari 16.4 has no `ArrayBuffer.prototype.detached` (added in Safari 17.4), so we can't detect detached buffers there.
  * TransformStream timing after `readable.cancel()`, also failing on current WebKit.

The full lists of failures are not kept in this repository, since they would go stale.
Re-run the steps above to get them.
