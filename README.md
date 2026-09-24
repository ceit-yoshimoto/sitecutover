# sitecutover

> Catch website migration regressions before they become production incidents.

**Status:** v0.1.0 is prepared for release and is not published to npm yet.

`sitecutover` is an open-source CLI for auditing website migrations, redesigns, CMS moves, domain changes, and production cutovers.

It compares a source site and a target site, then reports migration-sensitive regressions such as missing pages, broken redirects, unexpected `noindex`, canonical changes, broken internal links, and metadata differences.

The project is designed for web developers, agencies, maintainers, and small teams that need a repeatable pre-launch and post-launch QA process without relying on a proprietary dashboard.

## Why this exists

Website cutovers often fail in small but expensive ways:

- a page that used to return `200` becomes `404`
- a staging `noindex` directive reaches production
- redirects point to the wrong destination
- canonical URLs still reference the old host
- internal links break after a path change
- titles or descriptions disappear during a CMS migration
- sitemap coverage changes unexpectedly

These checks are easy to perform individually and easy to forget under launch pressure. `sitecutover` aims to make them repeatable, scriptable, and CI-friendly.

## Requirements

- Node.js 24 or newer (`.nvmrc` is `24`)
- npm

The package is not on the npm registry yet. Install it from a local clone.

```bash
git clone https://github.com/ceit-yoshimoto/sitecutover.git
cd sitecutover
npm ci
npm run build
node dist/cli/main.js --help
node dist/cli/main.js --version
```

## Usage

```bash
node dist/cli/main.js compare \
  --from https://old.example.com/ \
  --to https://new.example.com/
```

`--from` and `--to` must be origin roots, such as `https://example.com/`. A path, query, or embedded username and password is rejected before any request. The audit sends `GET` only. It does not submit forms, run page scripts, or send credentials.

Comparison is source-driven. The source site is crawled first. Each source URL that returned a usable `2xx` is then requested on the target origin, even when the target home page does not link it. Same-origin redirects are followed. A redirect to another origin, including a loopback or private address, is recorded and is not requested.

```bash
node dist/cli/main.js compare --from https://old.example.com/ --to https://new.example.com/ --format console
node dist/cli/main.js compare --from https://old.example.com/ --to https://new.example.com/ --format json
node dist/cli/main.js compare --from https://old.example.com/ --to https://new.example.com/ --format markdown --output report.md
```

`--output` writes the report to that file and does not also print it. Omit `--output` to print the report on stdout.

`--fail-on` defaults to `error`.

- `error`: exit `1` when the report has at least one error
- `warning`: exit `1` when the report has at least one warning or error
- `never`: exit `0` even when the report has findings

Info findings alone do not meet the `error` or `warning` threshold.

`--no-sitemap` skips `robots.txt` and sitemap requests. SC008 does not run. SC001–SC007 still run.

Other defaults: `--max-pages 250`, `--concurrency 5`, `--timeout 15000`.

Console output looks like this:

```text
sitecutover 0.1.0

Source: https://old.example.com
Target: https://new.example.com
Audited: 2026-09-22T00:00:01.500Z
Pages checked: 124
Source pages: 80
Target pages: 90

ERROR 1
WARN  2
INFO  1

ERROR SC001 /foo/
  Target returned 404; source returned 200
  Source: https://old.example.com/foo/
  Target: https://new.example.com/foo/
  Help: Restore the target page or add a redirect.
```

## Exit codes

| Code | Meaning                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ |
| `0`  | The audit finished below the `--fail-on` threshold                                                     |
| `1`  | The audit finished and findings met the threshold                                                      |
| `2`  | Invalid options, a report file could not be written, or the source root is not a usable `2xx` baseline |

A target `404`, or a target request failure that can be recorded as a finding, stays in the report and uses `0` or `1`.

## v0.1 constraints

- Read-only `GET` requests. The tool does not submit forms or change the site.
- `--from` and `--to` are origin roots only. There is no path remapping.
- A cross-origin redirect is recorded and not requested. SC002 reports that stop as a warning, and SC001 does not report it again.
- Links inside an SVG subtree, including `<foreignObject>`, are not crawled in v0.1.
- Authentication is not supported. The audit does not send `Authorization`, `Cookie`, or Basic Auth. A URL with an embedded username or password is rejected.
- The source root must finish as HTTP `2xx`. Otherwise the audit stops before the target is requested.
- A source child that returns `404` or `410` is omitted. Other source pages that cannot be compared produce an SC001 warning.
- `pagesExamined` counts usable `2xx` source pages. `sourcePages` and `targetPages` count crawl attempts.
- HTML metadata and links are parsed from `text/html` and `application/xhtml+xml` only. SC003–SC006 run only when that target response is a successful `2xx` page.
- A target `401` or `403`, like any other final non-2xx status, is an SC001 error when the source page is a usable `2xx` baseline. Redirect failures stay on SC002.
- `/a//b` and `/a/b` stay distinct.
- No browser automation or visual diff.

See [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) for the rule contract and [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) for what remains before `0.1.0`.

## Dogfood

Use `--fail-on never` for the first run so findings are written without failing the process.

```bash
mkdir -p reports
node dist/cli/main.js compare \
  --from https://old.example.com/ \
  --to https://new.example.com/ \
  --format json \
  --output reports/dogfood-report.json \
  --fail-on never
```

Replace the two example origins with the sites you are checking. A real report contains those URLs. Do not commit it. `reports/` and `dogfood-report.*` are gitignored.

## MVP checks

The first release is intentionally small and read-only.

- HTTP status comparison
- redirect chain inspection
- canonical comparison
- `meta robots` / `X-Robots-Tag` inspection
- title comparison
- meta description comparison
- internal link validation
- sitemap discovery and coverage comparison
- source-path-to-target-path existence checks

See [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) for the detailed contract.

## Non-goals for v0.1

`sitecutover` will not initially:

- submit forms
- mutate websites
- perform visual regression testing
- run Lighthouse
- execute authenticated browser journeys
- replace a crawler or full SEO platform
- automatically rewrite redirects

Those may be added later as optional modules where they clearly support migration QA.

## Design principles

1. **Read-only by default.** Audits should not change the site being tested.
2. **Useful locally and in CI.** The same engine should power terminal usage and GitHub Actions.
3. **Deterministic core.** AI may help contributors build and maintain the project, but audit results must not depend on an LLM.
4. **Explain every finding.** A failure should say what changed, why it matters, and which URLs are involved.
5. **Start small.** Prefer a dependable migration QA core over a giant all-purpose SEO suite.

## Proposed stack

- Node.js 24 LTS+
- TypeScript
- ESM
- npm
- Vitest
- HTTP + HTML parsing first; browser automation only when a future check requires it

## Project documents

- [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/INITIAL_ISSUES.md`](docs/INITIAL_ISSUES.md)
- [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`AGENTS.md`](AGENTS.md)

## Development

Node.js 24 or newer is required (`.nvmrc`).

The package stays private until the v0.1.0 release. `npm run prepack` builds `dist/` before `npm pack`. `npm run pack:check` lists the files that would be published.

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
node dist/cli/main.js --help
npm run pack:check
```

## Contributing

The project is being bootstrapped. Bug reports, migration edge cases, fixture sites, documentation improvements, and focused pull requests are welcome.

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Security

Please do not publish credentials, private staging URLs, Basic Auth values, cookies, or client data in issues or fixtures. See [`SECURITY.md`](SECURITY.md).

## License

MIT. See [`LICENSE`](LICENSE).
