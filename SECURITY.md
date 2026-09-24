# Security Policy

`sitecutover` is a network-facing auditing tool, so security and privacy boundaries matter even though its core behavior is read-only.

## Reporting vulnerabilities

Please report security issues privately to the project maintainer rather than opening a public GitHub issue.

Until a dedicated security contact is published, use GitHub's private vulnerability reporting feature if enabled for the repository.

## Sensitive data

Never include real credentials, authorization headers, cookies, private staging URLs, or client data in public issues, tests, screenshots, or fixtures.

## Project security principles

- Audit operations use unauthenticated `GET` requests. v0.1 does not send `Authorization`, `Cookie`, or Basic Auth, and it rejects URLs that embed a username or password.
- Form submission and state-changing actions are out of scope for the core crawler.
- Secrets must never be written to reports or logs.
- If custom headers are added in a future release, sensitive values must be redacted from diagnostics.
- External URLs discovered during a crawl must not be recursively crawled by default.
- Redirect behavior must have loop and hop limits.
- HTML parsing must not execute page JavaScript in the default audit path.
