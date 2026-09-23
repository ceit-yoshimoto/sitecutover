# Contributing to sitecutover

Thanks for helping improve `sitecutover`.

The project values small, testable changes that improve real website migration and cutover workflows.

## Good contributions

Examples include:

- a reproducible migration regression case
- a new fixture for a redirect/canonical/noindex edge case
- a focused checker with tests
- clearer finding messages
- performance improvements that preserve deterministic output
- documentation for a real hosting/CMS migration scenario

## Before opening an issue

Please remove all client-sensitive information.

Do not include:

- passwords or Basic Auth credentials
- cookies, session tokens, API keys, or headers containing secrets
- private repository URLs
- unpublished client hostnames when disclosure is not authorized
- personal information copied from production content

A minimized public reproduction is preferred.

## Development principles

- Keep the audit engine read-only.
- Avoid hidden network calls.
- Do not introduce an LLM dependency into the deterministic audit path.
- New checks should return structured findings, not print directly from checker code.
- Every bug fix should include a regression test when practical.
- Network tests should use local fixtures/mocks unless the behavior cannot reasonably be tested that way.

## Local workflow

Node.js 24 or newer is required.

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
node dist/cli/main.js --help
```

## Pull requests

Keep PRs narrowly scoped. A useful PR description answers:

1. What migration problem does this solve?
2. What behavior changed?
3. How is it tested?
4. Does it change the CLI or report schema?
5. Is there any compatibility or security impact?

Breaking schema or CLI changes require explicit discussion before implementation.
