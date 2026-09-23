# AGENTS.md

This file defines project-wide instructions for AI coding agents and human contributors.

## Product goal

Build `sitecutover`, a dependable open-source CLI that detects website migration and production-cutover regressions.

The project must remain useful without any AI service at runtime. AI tools may assist development, testing, triage, and maintenance, but audit results must be deterministic.

## Priorities

1. Correctness of findings
2. Safety and read-only behavior
3. Clear explanations
4. Testability
5. Stable machine-readable output
6. Performance
7. Feature breadth

## v0.1 scope

Implement only the behavior defined in `docs/MVP_SPEC.md` unless the user explicitly changes scope.

Do not add Playwright, a database, a web dashboard, an LLM SDK, telemetry, or plugin architecture to v0.1 without a demonstrated requirement.

## Technical direction

- Node.js 24 LTS+
- TypeScript with strict type checking
- ESM
- npm
- Vitest
- dependency-light design
- structured domain types for pages, crawls, checks, and findings

## Architecture rules

- CLI parsing must be separate from audit logic.
- Crawling/fetching must be separate from checking.
- Checkers return structured findings and never own terminal output.
- Reporters consume a stable report model.
- Network access should be injectable/mockable for tests.
- Avoid global mutable state.
- Limit crawl concurrency and page count.
- Only crawl URLs within the configured target origin by default.

## Finding contract

Each finding should contain enough information to render console, JSON, and Markdown output. Prefer fields such as:

- `ruleId`
- `severity`
- `message`
- `path`
- `sourceUrl`
- `targetUrl`
- `sourceValue`
- `targetValue`
- `help`

Exact types may evolve during implementation, but keep the model serializable and deterministic.

## Testing rules

- Write unit tests for URL normalization and every checker.
- Use fixture HTML for parser behavior.
- Use a local HTTP test server for redirects/status/crawl integration tests.
- Add regression tests before or with bug fixes.
- Avoid tests that depend on arbitrary public websites.

## Security/privacy

- Never commit credentials.
- Never put real client domains or content into fixtures unless explicitly authorized.
- Redact sensitive request headers from errors/logs.
- Do not execute scripts from crawled HTML in the default engine.

## Change discipline

Before implementing a feature:

1. Identify the related requirement or issue.
2. Confirm whether it belongs in v0.1.
3. Update tests with the code.
4. Update README/docs if user-visible behavior changes.
5. Note schema/CLI compatibility implications.

Do not perform unrelated refactors while implementing a focused issue.
