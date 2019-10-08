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
