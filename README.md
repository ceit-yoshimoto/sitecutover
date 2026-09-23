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

## Planned v0.1

```bash
sitecutover compare \
  --from https://old.example.com \
  --to https://new.example.com
```

Expected output shape:

```text
sitecutover

Source: https://old.example.com
Target: https://new.example.com
Pages checked: 124

PASS  113
WARN    8
ERROR   3

ERROR /column/foo/
  source: 200
  target: 404

WARN /company/
  canonical changed
  source: https://old.example.com/company/
  target: https://old.example.com/company/
  expected target host: new.example.com
```

Planned report formats:

```bash
sitecutover compare --from ... --to ... --format console
sitecutover compare --from ... --to ... --format json > report.json
sitecutover compare --from ... --to ... --format markdown > report.md
```

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

Library code currently covers the domain model, read-only fetching, same-origin crawling, HTML metadata, source/target pairing, and page rules SC001–SC007. The `compare` command, reporters, and SC008 sitemap coverage are still to be implemented. The package stays private until the v0.1 release.

Current library rules:

- `--from` and `--to` must be origin roots such as `https://example.com/`. A path or query is rejected.
- Same-origin redirects are followed. A cross-origin `Location`, including loopback and private addresses, is recorded and not requested.
- `/a//b` and `/a/b` stay distinct.
- HTML metadata and links are parsed from `text/html` and `application/xhtml+xml` only.
- SC007 checks each unique target internal link once, records referring pages separately from `sourceUrl`, and caps additional fetches at `--max-pages`.

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
