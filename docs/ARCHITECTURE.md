# Architecture

## Overview

`sitecutover` should use a pipeline architecture:

```text
CLI / Config
    |
    v
URL Discovery -> Fetch -> Parse -> Page Model
                              |
                              v
                    Source/Target Comparison
                              |
                              v
                           Checkers
                              |
                              v
                       Structured Report
                      /       |        \
                 Console     JSON    Markdown
```

The core engine should have no dependency on terminal formatting or GitHub Actions.

## Proposed modules

```text
src/
  cli/
    main.ts
    options.ts
  config/
    load-config.ts
    schema.ts
  crawl/
    crawler.ts
    discover.ts
    limits.ts
  http/
    fetch-page.ts
    redirect-trace.ts
    user-agent.ts
  parse/
    parse-html.ts
    extract-links.ts
    extract-metadata.ts
  model/
    page.ts
    finding.ts
    report.ts
  compare/
    pair-pages.ts
    compare-sites.ts
  checks/
    status.ts
    redirects.ts
    canonical.ts
    robots.ts
    title.ts
    description.ts
    internal-links.ts
  sitemap/
    parse-sitemap.ts
    robots.ts
    discover.ts
    coverage.ts
    audit-sitemaps.ts
  reporters/
    console.ts
    json.ts
    markdown.ts
  index.ts
```

This is a direction, not a requirement to create one file for every item before it is useful.

## Domain model

### PageSnapshot

Represents one fetched URL without reporter-specific formatting.

Suggested data:

- requested URL
- final URL
- status
- redirect hops
- response headers needed by checks
- content type
- normalized internal links
- title
- meta description
- canonical
- robots directives
- fetch error, if any

Do not keep entire response bodies in the final report.

### PagePair

Pairs a source path with the corresponding target path.

Default MVP mapping:

```text
source origin + /path?q=x
       ->
target origin + /path?q=x
```

A later release may support explicit path maps for redesigned information architectures.

### Finding

A serializable result from a rule.

Suggested shape:

```ts
interface Finding {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  sourceUrl?: string;
  targetUrl?: string;
  referrers?: readonly string[];
  sourceValue?: unknown;
  targetValue?: unknown;
  help?: string;
}
```

### AuditReport

Contains:

- tool version
- timestamp
- normalized input configuration
- source/target summary
- page counts
- findings
- counts by severity
- timing data

Never serialize secrets into configuration fields.

## Crawl strategy

### Starting URLs

`compareSites()` crawls the source site first, then the target site. The target crawl is seeded with its root and every source URL mapped onto the target origin, before it follows links found only on the target. That keeps a source page from being reported missing when the target has the URL but does not link it from the home page. Target-only pages are not paired for SC001–SC006.

The phases do not overlap, so the configured concurrency is the simultaneous request limit.

Sitemap coverage (SC008) is a separate fetch and comparison. It does not add sitemap URLs to the HTML crawl.

### Origin boundary

Only crawl the configured origin by default. External links may be recorded but should not be recursively crawled. A redirect to another origin is recorded and not requested.

### Normalization

Create one canonical internal representation for crawl deduplication. Decide and test behavior for:

- fragments
- default ports
- trailing slash differences
- query strings
- repeated slashes, which stay distinct because they can address different resources
- percent encoding

Do not silently rewrite semantically meaningful query parameters.

### Limits

Suggested defaults:

- concurrency: 5
- max pages: 250
- redirect hops: 10
- request timeout: 15 seconds
- sitemap documents per origin: 50 (hard cap 200). `robots.txt` is a separate request
- sitemap body retained in memory: 2,000,000 bytes
- unchecked URL sample stored on a finding: 100
- user agent: `sitecutover/<version>`

All limits should be configurable within safe bounds.

## HTTP behavior

Default to `GET` because metadata and link checks require HTML. `HEAD` may be used only as an internal optimization where behavior is equivalent and tested.

The engine must:

- follow same-origin redirects with a bounded hop count
- record a cross-origin `Location` without requesting it
- preserve a redirect trace
- accept HTML only for HTML parsing
- handle timeouts and network errors as findings/runtime diagnostics
- avoid form submission and unsafe HTTP methods

## Checker design

A checker should be close to a pure function:

```text
page pair / crawl context -> Finding[]
```

This makes rules independently testable and allows future policy configuration.

Checkers must not:

- write files directly
- print to stdout
- call an LLM
- mutate crawler state

## Reporter design

`renderConsoleReport`, `renderJsonReport`, and `renderMarkdownReport` are pure functions. `renderReport` selects one of them. They do not write to stdout, fetch, or inspect pages.

### Console

Summary first, then findings in report order. Severity labels are `ERROR`, `WARN`, and `INFO`. An empty finding list says `No findings.`

### JSON

`renderJsonReport` returns `serializeAuditReport`. That is the machine-readable contract, including config, timing, referrers, and structured values.

### Markdown

Headings and lists suitable for a GitHub issue, pull request comment, or CI artifact. User-controlled text is fenced or inline code.

## Future GitHub Action

The GitHub Action should wrap the CLI rather than duplicate audit logic.

```text
GitHub Action inputs
      |
      v
 sitecutover CLI
      |
      v
 JSON report
      |
      +--> workflow exit status
      +--> summary / PR comment
```

## Why no browser in v0.1

A browser runtime adds significant install size, execution time, and CI complexity. Most MVP checks can be implemented from HTTP responses and parsed HTML.

Browser-backed checks can be added later for JavaScript-rendered metadata or application routes when real usage proves the need.
