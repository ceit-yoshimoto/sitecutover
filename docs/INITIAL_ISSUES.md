# Initial GitHub Issues

Create these as separate GitHub issues. The order below is the suggested implementation order.

---

## 1. Bootstrap TypeScript CLI and quality tooling

**Labels:** `type: chore`, `area: cli`, `milestone: v0.1`

### Goal

Create the minimal Node.js/TypeScript project scaffold and a working `sitecutover --help` command.

### Acceptance criteria

- Node.js 24 LTS+ documented
- ESM TypeScript project
- npm scripts for build, test, typecheck, lint, format
- `sitecutover --help` works after build
- Vitest configured
- CI workflow runs quality checks
- no audit behavior implemented yet

---

## 2. Define domain types and stable finding model

**Labels:** `type: feature`, `area: core`, `milestone: v0.1`

### Goal

Define serializable types for page snapshots, redirect hops, findings, summaries, and audit reports.

### Acceptance criteria

- finding severity and rule IDs represented explicitly
- report model contains version/config/summary/findings
- no secret-bearing values required by the model
- tests verify JSON serialization

---

## 3. Implement bounded HTTP fetcher and redirect tracing

**Labels:** `type: feature`, `area: http`, `milestone: v0.1`

### Goal

Fetch pages safely while preserving status, final URL, headers, and redirect trace.

### Acceptance criteria

- timeout support
- redirect hop limit
- loop detection
- custom user agent
- network errors represented without crashing the whole audit
- integration tests use a local HTTP server

---

## 4. Implement internal crawler and URL normalization

**Labels:** `type: feature`, `area: crawl`, `milestone: v0.1`

### Goal

Discover bounded internal URLs from root pages and HTML links.

### Acceptance criteria

- only configured origin crawled by default
- fragments deduplicated
- max page limit enforced
- concurrency limit enforced
- external links not recursively fetched
- normalization behavior unit tested

---

## 5. Parse HTML migration metadata

**Labels:** `type: feature`, `area: parsing`, `milestone: v0.1`

### Goal

Extract the metadata required by v0.1 checks.

### Acceptance criteria

Extract and normalize:

- title
- meta description
- canonical
- meta robots
- internal links

Also expose `X-Robots-Tag` from response headers in the page model.

---

## 6. Implement source/target page pairing

**Labels:** `type: feature`, `area: compare`, `milestone: v0.1`

### Goal

Map source URLs to target URLs by preserving path and query.

### Acceptance criteria

- mapping is independent of host
- trailing slash/query behavior is tested
- page pairs can represent source-only and target-only states
- no explicit redirect-map support yet

---

## 7. Implement SC001–SC006 page comparison rules

**Labels:** `type: feature`, `area: checks`, `milestone: v0.1`

### Goal

Implement target status, redirect, canonical, indexing, title, and description rules from the MVP spec.

### Acceptance criteria

- each rule has focused unit tests
- rules return structured findings only
- messages show source/target values where useful
- target `noindex` regression is error-level
- old-host canonical regression is error-level

---

## 8. Implement SC007 internal broken-link validation

**Labels:** `type: feature`, `area: checks`, `milestone: v0.1`

### Goal

Validate target internal links without redundant requests.

### Acceptance criteria

- deduplicate checked destinations
- report `404/410/5xx` links
- preserve source page context where the broken link was found
- test redirects and duplicate links

---

## 9. Implement sitemap discovery and SC008 coverage comparison

**Labels:** `type: feature`, `area: sitemap`, `milestone: v0.1`

### Goal

Discover XML sitemaps and compare source/target URL coverage.

### Acceptance criteria

- read sitemap references from robots.txt
- support sitemap indexes
- bounded parsing
- malformed sitemap produces a finding, not an unhandled crash
- compare source sitemap paths against target origin

---

## 10. Add console, JSON, and Markdown reporters

**Labels:** `type: feature`, `area: reporting`, `milestone: v0.1`

### Goal

Render one audit model into all required output formats.

### Acceptance criteria

- reporters contain no audit/check logic
- console summary is readable
- JSON is deterministic for deterministic inputs
- Markdown works as a GitHub issue/comment artifact
- tests or snapshots cover output

---

## 11. Implement CLI exit thresholds and output files

**Labels:** `type: feature`, `area: cli`, `milestone: v0.1`

### Goal

Make the CLI reliable in scripts and CI.

### Acceptance criteria

- `--fail-on error|warning|never`
- `--output` writes selected format to file
- exit codes follow `docs/MVP_SPEC.md`
- invalid options fail before crawling

---

## 12. Prepare v0.1.0 release and dogfooding checklist

**Labels:** `type: release`, `area: docs`, `milestone: v0.1`

### Goal

Run the tool on several real migration scenarios, fix critical defects, and publish the first tagged release.

### Acceptance criteria

- README matches implemented commands
- changelog created
- no client credentials/data committed
- at least three anonymized migration scenarios exercised
- npm package metadata verified
- `v0.1.0` tag/release published
- follow-up issues created from dogfooding results
