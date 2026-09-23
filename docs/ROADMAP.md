# Roadmap

The roadmap is intentionally outcome-based. Dates are not promises.

## v0.1 — Migration comparison core

Goal: dependable source-vs-target comparison from the terminal.

- bounded crawler
- page pairing by path/query
- HTTP status checks
- redirect checks
- canonical checks
- indexing directive checks
- title/description checks
- internal broken-link checks
- sitemap coverage checks
- console, JSON, Markdown output
- stable exit-code behavior
- test fixtures and CI

## v0.2 — Real migration workflows

Goal: handle common cases where old and new information architectures differ.

Candidates:

- explicit URL mapping file
- ignore/include path patterns
- per-rule configuration
- baseline report comparison
- configurable severity overrides
- HTTP header support with secret redaction
- Basic Auth via environment variables / safe secret input
- richer sitemap diagnostics

## v0.3 — GitHub integration

Goal: make audits easy to run as part of delivery workflows.

- first-party GitHub Action
- workflow summary
- report artifact upload
- optional PR comment
- annotations for error-level findings
- example workflows for preview/staging environments

## v0.4 — CMS and hosting recipes

Goal: improve usability without hard-coding vendor-specific logic into the core.

- WordPress migration recipe
- static-site migration recipe
- reverse-proxy/CDN cutover recipe
- domain change checklist
- staging-to-production recipe

Presets should remain configuration/documentation unless code-level specialization is clearly justified.

## Later exploration

Only pursue these after user demand is demonstrated:

- JavaScript-rendered checks using an optional browser package
- visual regression integration
- Lighthouse integration
- structured data comparison
- hreflang checks
- performance budgets
- Cloudflare/GitHub deployment helpers
- plugin/checker extension API

## Explicit non-goal

Do not turn `sitecutover` into a general AI website reviewer. Deterministic migration verification is the project's differentiator.
