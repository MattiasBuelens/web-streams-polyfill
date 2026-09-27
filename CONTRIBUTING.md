# Guidelines

## Setting up

1. Clone the repository
1. Run `npm install`

## Scripts

- `npm run build` generates the bundled JavaScript (`.js`) and TypeScript type definitions (`.d.ts`), and outputs them to `dist/`. These generated files are **not** checked into version control.
- `npm test` runs the three test suites:
  - `npm run test:wpt` runs the [Web Platform Tests for Streams][wpt-streams] against the generated JavaScript bundle, to verify that the polyfill's run-time behavior matches the specification.
  - `npm run test:types` runs the TypeScript compiler against some reference code that uses the generated type definitions, to verify that the code successfully passes the type check.
  - `npm run test:unit` runs a few unit tests in a Node environment, to verify that the polyfill also works without a browser environment.
  - `npm run test:bundlers` runs integration tests with popular bundlers, to verify that they can correctly resolve and bundle the polyfill.

## Changelog

We use [Changie](https://changie.dev/guide/quick_start/) to manage release notes.
Install [v1.26.0](https://github.com/miniscruff/changie/releases/tag/v1.26.0), run
`changie new`, and commit the generated file in `.changes/unreleased/` with your
change. Write the entry as Markdown, including relevant PR or issue links.
`CHANGELOG.md` is generated; add new entries through fragments.

PRs must add a new fragment unless a maintainer applies `skip-changelog`.
Generated release PRs are exempt. See the [Changie CLI docs](https://changie.dev/cli/changie_new/)
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
