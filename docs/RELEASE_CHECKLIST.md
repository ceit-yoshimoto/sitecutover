# v0.1.0 release checklist

This checklist records the first public release. The `v0.1.0` tag stays on the release commit. Later checklist commits do not move that tag.

## Before tagging

- [x] CI on `main` is green
- [x] `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, and `npm run build` pass on Node.js 24
- [x] `npm run pack:check` shows only `package.json`, `README.md`, `LICENSE`, and `dist/`
- [x] A local tarball install runs `sitecutover --help` and `sitecutover compare --help`
- [x] Dogfood on at least one real source/target pair is complete
- [x] Dogfood results are reviewed. Report files stay out of git (`reports/` is ignored)
- [x] README matches the shipped command, defaults, and constraints
- [x] SECURITY.md still matches the read-only behavior, and the repo has no credentials or private client data
- [x] `package.json` metadata is final: description, license, repository, homepage, bugs, bin, engines, files, keywords

## Dogfood decisions

- [x] SVG `<foreignObject>` and other SVG subtree markup: v0.1 does not crawl links inside an SVG subtree. This is a documented constraint, not a parser change for this release.
- [x] Target `401` / `403`: a source `2xx` page whose target answers `401`, `403`, or another final non-2xx status is an SC001 error. Redirect loop, hop limit, and cross-origin redirect stops stay on SC002.
- [x] Target cross-origin redirect: record the `Location`, do not request the other origin, report SC002 as a warning, and do not also report SC001. The severity stays a warning.

## Publish

- [x] Set `"version": "0.1.0"`
- [x] Set `"private": false`
- [x] Confirm the npm name `sitecutover` is available
- [x] `npm publish` from the reviewed commit
- [x] Tag `v0.1.0` on that commit
- [x] Create the GitHub Release from that tag
- [x] From a clean machine or temporary directory, install the published package and run `sitecutover --help` and `sitecutover --version`
