# sitecutover

> Catch website migration regressions before they become production incidents.

**Status:** pre-alpha / v0.1 in development.

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

## Usage

The package is still private and is not published. From a local build:

```bash
node dist/cli/main.js compare \
  --from https://old.example.com \
  --to https://new.example.com
```

`--from` and `--to` are origin roots. The audit crawls the source site, fetches each discovered path on the target even when the target does not link it, then runs SC001–SC008. Console output looks like this:

```text
sitecutover 0.0.0

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

```bash
node dist/cli/main.js compare --from https://old.example.com/ --to https://new.example.com/ --format console
node dist/cli/main.js compare --from https://old.example.com/ --to https://new.example.com/ --format json
node dist/cli/main.js compare --from https://old.example.com/ --to https://new.example.com/ --format markdown --output report.md
```

`--output` writes the report to that file and does not also print it. Omit `--output` to print the report on stdout.

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
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`AGENTS.md`](AGENTS.md)

## Development

Node.js 24 or newer is required (`.nvmrc`).

`sitecutover compare` crawls a source origin, checks the mapped target URLs, and reports SC001–SC008. The package stays private until the v0.1 release.

Current library rules:

- `--from` and `--to` must be origin roots such as `https://example.com/`. A path or query is rejected.
- Same-origin redirects are followed. A cross-origin `Location`, including loopback and private addresses, is recorded and not requested.
- `/a//b` and `/a/b` stay distinct.
- HTML metadata and links are parsed from `text/html` and `application/xhtml+xml` only.
- SC007 checks each unique target internal link once, records referring pages separately from `sourceUrl`, and caps additional fetches at `--max-pages`. A budget finding stores the full unchecked count and at most 100 sample URLs.
- SC008 compares source sitemap URLs with target sitemap coverage after origin-root mapping. Discovery stays on the configured origin, is bounded per origin, and reads sitemap XML with a sitemap reader rather than the HTML parser. Each sitemap body is limited to 2,000,000 bytes. A well-known sitemap that cannot be fetched is a warning; a 404, 410, or HTML response at a guessed path is not. An unreadable `robots.txt` is a separate warning, and discovery still continues with the well-known paths. Unchecked sitemap URLs in a finding are capped at the same 100-URL sample as SC007.

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
node dist/cli/main.js --help
```

## Contributing

The project is being bootstrapped. Bug reports, migration edge cases, fixture sites, documentation improvements, and focused pull requests are welcome.

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Security

Please do not publish credentials, private staging URLs, Basic Auth values, cookies, or client data in issues or fixtures. See [`SECURITY.md`](SECURITY.md).

## License

MIT. See [`LICENSE`](LICENSE).
