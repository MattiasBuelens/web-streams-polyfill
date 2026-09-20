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

The **Changelog entry** PR check requires a newly added fragment; modifying an
existing entry does not satisfy it. For changes that do not need release notes
(such as documentation or development tooling), a maintainer can apply the
`skip-changelog` label. Adding or removing the label reruns the check. Release
PRs created by **Prepare release** are exempt because they consume fragments.
The separate **Validate changelog fragments** check runs even for exempt PRs.

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

## Preparing a release

1. In GitHub Actions, select **Prepare release**, then **Run workflow**.
1. Select the branch to release from (normally `master`) and a `major`, `minor`,
   or `patch` bump.
1. The workflow batches pending fragments, regenerates `CHANGELOG.md`, updates
   `package.json` and `package-lock.json`, and opens a draft release pull request.
   It requires at least one pending fragment and matching package/changelog versions.
1. Review the notes and version, then mark the pull request **Ready for review**
   to trigger the normal test workflow. After the checks pass, merge it.
1. Create a GitHub Release for the new `v<version>` tag on the merged release
   commit, using the notes in `.changes/v<version>.md`. The existing **Publish
   release** workflow publishes the package to npm.

Marking the draft ready for review as a maintainer triggers the configured
`ready_for_review` event. If GitHub displays an **Approve workflows to run**
banner on the bot-created PR, approve the runs as well.

Release branches are named `release/v<version>` (for example, `release/v4.3.1`).
Rerunning preparation on the same base branch for the same version updates the
same release PR. Selecting a different bump creates a separate release branch
and PR; close the superseded PR if it is no longer needed. Preparation regenerates
the notes from the base branch's fragments, so make lasting corrections there
before rerunning. After updating an existing release PR, the workflow returns
it to draft; mark it ready again to
trigger CI for the new commit.

To prepare the same changes locally, run these commands from a clean checkout
with the matching package/changelog version, substituting the chosen bump:

```shell
changie batch patch --allow-no-changes=false
changie merge --include-unreleased "## Unreleased"
npm version <new-version> --no-git-tag-version --ignore-scripts --workspaces=false
```

Use the version printed by `changie latest` for `<new-version>`, and commit the
changed release files together. These commands prepare files only; they do not
create a tag or publish a package.

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
