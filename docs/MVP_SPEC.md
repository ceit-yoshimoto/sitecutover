# v0.1 MVP Specification

## Goal

Provide a safe CLI that compares a source website with a target website and detects common migration regressions.

## Primary command

```bash
sitecutover compare --from <source-url> --to <target-url>
```

Example:

```bash
sitecutover compare \
  --from https://www.example.com \
  --to https://staging.example.net \
  --max-pages 100 \
  --format console
```

## Required CLI options

| Option          | Required | Default   | Meaning                                         |
| --------------- | -------- | --------- | ----------------------------------------------- |
| `--from`        | yes      | -         | source/original site root                       |
| `--to`          | yes      | -         | target/new site root                            |
| `--max-pages`   | no       | `250`     | crawl page limit                                |
| `--concurrency` | no       | `5`       | simultaneous requests                           |
| `--timeout`     | no       | `15000`   | request timeout in ms                           |
| `--format`      | no       | `console` | `console`, `json`, or `markdown`                |
| `--output`      | no       | stdout    | write report to a file                          |
| `--fail-on`     | no       | `error`   | exit non-zero on `error`, `warning`, or `never` |
| `--no-sitemap`  | no       | false     | disable sitemap discovery                       |

Validate inputs before network access.

## Exit codes

- `0`: audit completed and did not meet the configured failure threshold
- `1`: audit completed and findings met/exceeded the failure threshold
- `2`: invalid configuration or runtime failure prevented a valid audit

Do not use many rule-specific exit codes.

## Page discovery

For each site:

1. enqueue root URL
2. inspect sitemap location(s)
3. crawl internal links breadth-first until no URLs remain or `max-pages` is reached
4. deduplicate normalized URLs
5. never recursively crawl external origins

The implementation may optimize by using source discovery as the primary path set for target comparisons, but target-only sitemap differences must still be reportable.

## URL pairing

For v0.1, preserve path and query when mapping source to target.

Example:

```text
https://old.example.com/services/web/?lang=ja
->
https://new.example.net/services/web/?lang=ja
```

Explicit path remapping is deferred to a later release.

`--from` and `--to` must each be an origin root: `http` or `https`, no credentials, pathname `/`, and no query. A fragment is ignored. A pathname or query is invalid configuration and must fail before any request. v0.1 maps a page by replacing the origin only, so a path prefix such as `https://example.com/blog/` is outside this release.

## URL normalization

Crawl deduplication uses one normalized form:

- drop fragments and default ports
- preserve trailing slashes (`/docs` and `/docs/` stay distinct)
- preserve repeated slashes (`/a//b` and `/a/b` stay distinct)
- preserve query order and repeated keys
- decode percent-encoding only for unreserved characters
- do not turn `%2F` into a path separator

Dot segments follow the WHATWG URL parser.

## Redirect safety

Same-origin redirects are followed up to the hop limit.

A `Location` with a different origin is not requested. The received hop and the unfetched `Location` stay on the trace, and SC002 reports that stop. This includes redirects to loopback, link-local, and private addresses, and redirects that change scheme, host, or port.

The document behind a cross-origin redirect is not crawled in v0.1.

## HTML parsing

Metadata and links are parsed with a standards HTML parser, and only from `text/html` or `application/xhtml+xml` responses. XML, plain text, and responses with no content type are not treated as HTML. Script and style contents are not executed or scanned as markup. SVG contents are not treated as HTML elements.

## Rules

### SC001 — target-status

**Error** when a source page that successfully serves content does not have an acceptable target page.

Minimum behavior:

- source `2xx` + target `404/410/5xx` => error
- network failure on target => error
- source missing pages should not automatically become target regressions

Report both statuses and URLs.

### SC002 — redirect-chain

Inspect redirects on target requests.

Findings:

- redirect loop => error
- redirect exceeds hop limit => error
- redirect chain longer than one hop => warning (initial default)
- redirect ending on unexpected external origin => warning/error based on safety policy

Always retain enough trace data to debug the chain.

### SC003 — canonical

For HTML pages:

- canonical points to source/old host on target => error
- canonical missing when source had one => warning
- canonical path unexpectedly differs => warning
- malformed canonical URL => warning

Do not require every page to have a canonical if neither source nor target has one.

### SC004 — indexing-directives

Inspect both:

- `<meta name="robots">`
- `X-Robots-Tag`

Target containing `noindex` when source was indexable => error.

Other directive differences may be warnings.

### SC005 — title

- target title missing when source title exists => warning
- target title empty => warning
- changed title is informational by default, not an error

The report should show source and target values.

### SC006 — meta-description

- target description missing when source description exists => warning
- changed description is informational by default

### SC007 — internal-link-status

For internal links discovered on the target:

- linked URL resolving to `404/410/5xx` => error
- redirect chain > 1 hop => warning

Deduplicate link checks by normalized URL. Check each unique internal link on crawled target pages once, and reuse a response the crawl already fetched. Record the checked URL, status, redirect trace, and referring pages. Ignore external URLs. A cross-origin redirect is not requested. A link check does not crawl links on that destination and does not bypass the crawl page limit.

### SC008 — sitemap-coverage

Discover common sitemap locations and/or references from `robots.txt`.

At minimum compare:

- source URLs present in source sitemap but absent from target coverage after origin mapping => warning
- malformed/unreadable sitemap => warning

Support sitemap indexes.

## robots.txt

v0.1 should fetch and expose robots.txt information for sitemap discovery.

Crawler compliance behavior must be documented before release. Until then, keep tests and implementation explicit rather than making ambiguous claims about full robots exclusion support.

## Output requirements

Every format must include:

- source and target origins
- audit timestamp
- tool version
- pages examined
- counts by severity
- rule ID for each finding
- affected URL/path
- actionable message

JSON output must additionally include the normalized configuration with secret-bearing fields omitted/redacted.

## Console UX

Default output should be concise. Detailed raw request data belongs in optional debug output, not the normal report.

Suggested order:

1. run header
2. progress (only when interactive)
3. summary
4. errors
5. warnings
6. info (optional/condensed)

## Performance target

For ordinary HTML sites, the overhead of the tool itself should be small relative to network latency. Avoid browser startup in v0.1.

## Safety requirements

- only safe read requests
- bounded concurrency
- bounded redirect hops
- bounded page count
- timeouts
- no script execution
- no form submission
- no credentials in reports/logs
- external-origin crawl disabled by default

## Definition of done for v0.1

- CLI behavior implemented
- all eight rules implemented or explicitly reduced in scope with documentation
- console/JSON/Markdown reporters
- deterministic tests with local fixtures
- CI runs typecheck, tests, lint, and build
- README installation and usage instructions updated to match reality
- tagged `v0.1.0` release
