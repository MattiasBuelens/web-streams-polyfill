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

Install [Changie v1.26.0](https://github.com/miniscruff/changie/releases/tag/v1.26.0)
and make the `changie` executable available on your `PATH`.

For a user-facing change, run `changie new` and select one of the changelog tags.
Write the description as Markdown, including any pull request or issue links.
For longer descriptions, use `changie new --editor` to open your editor.
Continuation lines are indented automatically when rendered; nested bullets in
the fragment body should start with `* `, without the outer bullet's indentation.
Commit the generated YAML file in `.changes/unreleased/` with your change.

To preview the changelog, including pending changes:

```shell
changie merge --include-unreleased "## Unreleased" --dry-run
```

`CHANGELOG.md` is generated when preparing a release. Add pending entries through
fragments instead of editing it directly; the checked-in `Unreleased` section is
only refreshed when the changelog is regenerated. To regenerate it locally, omit
`--dry-run` from the command above.

The header and tag legend live in `.changes/header.tpl.md`. Published release
notes live in `.changes/v<version>.md`; `.changes/v4.3.0.md` contains the imported
history through 4.3.0, preserving the original Markdown. Make any corrections to
published notes in those files, then regenerate the changelog.

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
