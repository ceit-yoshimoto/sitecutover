# v0.1.0 release checklist

This checklist is for the first public release. The package stays `private: true` at version `0.0.0` until every item below is done. Do not publish, tag, or create a GitHub Release early.

## Before tagging

- [ ] CI on `main` is green
- [ ] `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, and `npm run build` pass on Node.js 24
- [ ] `npm run pack:check` shows only `package.json`, `README.md`, `LICENSE`, and `dist/`
- [ ] A local tarball install runs `sitecutover --help` and `sitecutover compare --help`
- [ ] Dogfood on at least one real source/target pair is complete
- [ ] Dogfood results are reviewed. Report files stay out of git (`reports/` is ignored)
- [ ] README matches the shipped command, defaults, and constraints
- [ ] SECURITY.md still matches the read-only behavior, and the repo has no credentials or private client data
- [ ] `package.json` metadata is final: description, license, repository, homepage, bugs, bin, engines, files, keywords

## Dogfood questions still open

Confirm these on a real site before calling the release done. They are not new features for the candidate.

- [ ] SVG `<foreignObject>` and other SVG subtree markup: the HTML parser currently does not treat SVG contents as HTML elements, so links inside an SVG subtree are not crawled. Decide whether that should stay.
- [ ] Target `401` / `403`: SC001 does not treat these as errors. A source `2xx` page whose target answers `401` or `403` can finish with no SC001 finding. Decide whether that is the right migration signal.
- [ ] Target cross-origin redirect: the redirect `Location` is not requested. SC002 currently reports that stop as a warning. Decide whether warning remains the right severity.

## Publish

- [ ] Set `"version": "0.1.0"`
- [ ] Set `"private": false`
- [ ] Confirm the npm name `sitecutover` is available
- [ ] `npm publish` from the reviewed commit
- [ ] Tag `v0.1.0` on that commit
- [ ] Create the GitHub Release from that tag
- [ ] From a clean machine or temporary directory, install the published package and run `sitecutover --help` and `sitecutover --version`
