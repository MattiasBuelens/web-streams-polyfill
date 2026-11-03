# Guidelines

## Setting up

1. Clone the repository
1. Run `npm install`

## Scripts

- `npm run build` (or `npm run build:prod`) generates the minified JavaScript bundles in `dist/`
  and the bundled TypeScript type definitions in `types/`, using [Rolldown](https://rolldown.rs/).
  These generated files are **not** checked into version control.
  - The ES5 bundles are first bundled at ES2015, then downleveled to ES5 with [SWC](https://swc.rs/)
    and wrapped in a second Rolldown pass. See `rolldown.config.ts` for details.
  - The ES2015 bundles are minified with Oxc (Rolldown's built-in minifier), and the ES5 bundles with SWC.
    Oxc can't output ES5, and SWC drops `= undefined` default parameters, which changes `Function.length`
    and fails WPT for the ES2015 bundles ([swc#12203](https://github.com/swc-project/swc/issues/12203)).
- `npm run build:debug` generates unminified bundles with assertions enabled, `DEBUG` set to `true`
  and inline source maps. Use this while debugging a failing test.
- `npm run build:watch` runs the debug build in watch mode.
- `npm test` runs all test suites:
  - `npm run test:wpt` runs the [Web Platform Tests for Streams][wpt-streams] against the generated JavaScript bundle, to verify that the polyfill's run-time behavior matches the specification.
    It runs in Node, Chromium, Firefox and WebKit.
  - `npm run test:types` runs the TypeScript compiler against some reference code that uses the generated type definitions, to verify that the code successfully passes the type check.
  - `npm run test:api` checks that the generated type definitions match the API snapshot in `etc/ponyfill.api.d.ts`.
    After an intentional API change, run `npm run accept:api` and commit the updated snapshot.
  - `npm run test:unit` runs a few unit tests in a Node environment, to verify that the polyfill also works without a browser environment.
  - `npm run test:bundlers` runs integration tests with popular bundlers, to verify that they can correctly resolve and bundle the polyfill.
  - `npm run test:package` checks the published package's `exports` and types
    with [publint](https://publint.dev/) and [Are the types wrong?](https://arethetypeswrong.github.io/).
- `npm run size` prints the size of each bundle, compared with the latest release when it is installed.

## Native browser baselines

`npm run test:wpt:native` runs the same Web Platform Tests against each browser's own streams implementation,
without loading the polyfill. The tests that each browser fails are recorded in
`test/wpt/expectations/native-<browser>.json`, and the run fails when the results no longer match:
a new failure is reported as unexpected, and an expected failure that now passes is listed at the end.
These baselines tell us which tests a browser already fails on its own, before the polyfill changes anything.

`npm run test:wpt:patched` runs them again after installing the feature modules (`web-streams-polyfill/feature`)
on top of each native implementation, and compares against `test/wpt/expectations/patched-<browser>.json`.
Installing features must never break a test that passes natively: re-recording patched expectations fails
if a test fails only when patched.

Node.js implements every feature already, so `npm run test:wpt:patched:node` first removes the native
`ReadableStream.from()` and async iteration, so that our feature modules are tested on top of Node's streams.
The Node.js tests run in jsdom, whose objects come from a different realm than Node's streams.
That's why some tests fail in both the native and the patched Node.js run, e.g. those comparing prototypes.
The Node.js expectations are recorded with Node.js 22.

The expectations follow the browser versions of the installed Playwright release.
After updating Playwright (or Node.js 22 for the Node.js expectations), re-record them and commit the result:

```sh
npm run test:wpt:native:chromium -- --update-expectations
npm run test:wpt:patched:chromium -- --update-expectations
# ...and the same for firefox, webkit and node
```

## Using an installed browser for Web Platform Tests

The browser tests use Playwright's bundled browsers by default. To use an existing
browser executable, set `WPT_BROWSER_EXECUTABLE_PATH` for the matching test command:

```sh
WPT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:wpt:chromium
```

Custom browser versions may be incompatible with Playwright. Firefox requires
Playwright's patched Firefox build; a standard Firefox installation is not supported.

## Changelog

We use [Changie](https://changie.dev/guide/quick_start/) to manage release notes.
Install [v1.26.0](https://github.com/miniscruff/changie/releases/tag/v1.26.0), run
`changie new`, and commit the generated file in `.changes/unreleased/` with your
change. Write the entry as Markdown, including relevant PR or issue links.
`CHANGELOG.md` is generated; add new entries through fragments.

PRs must add a new fragment unless a maintainer applies `skip-changelog`.
Dependabot and generated release PRs are exempt. See the [Changie CLI docs](https://changie.dev/cli/changie_new/)
for editing options and the [configuration reference](https://changie.dev/config/)
for formatting details.

## Preparing a release

1. In GitHub Actions, run **Prepare release** on the target branch (normally
   `master`), choosing a `major`, `minor`, or `patch` bump.
1. Review the generated draft PR, which updates the changelog and package
   versions. Mark it **Ready for review**, wait for CI to pass, and merge it.
1. Create a GitHub Release with a `v<version>` tag on the merged release commit,
   using the notes in `.changes/v<version>.md`. This triggers publishing to npm.

## Miscellaneous

- Do not manually change any files within `test/web-platform-tests`, as they are part of a Git submodule.
- If you want to update the polyfill to a newer version of the streams specification:
  1. Find the commit of the `web-platform-tests` Git submodule of [the reference implementation][ref-impl].
  1. Update the submodule in `test/web-platform-tests` to the same commit.
  1. Update the polyfill implementation to pass the new tests.
  1. Commit, push and open a pull request. Thanks! 😁
- The polyfill's API should remain backwards compatible.
  The type tests can help to check API compatibility.

[wpt-streams]: https://github.com/web-platform-tests/wpt/tree/master/streams/
[ref-impl]: https://github.com/whatwg/streams/tree/master/reference-implementation/
