# Project Plan

## Problem

Website migrations and launches combine many individually simple checks into a time-sensitive operation. Agencies and developers frequently verify redirects, status codes, indexing directives, canonicals, metadata, and links manually across staging and production.

The failure mode is rarely a sophisticated algorithmic problem. It is inconsistency: one important check is skipped, or a regression appears only after DNS/hosting/CMS changes.

## Product thesis

A small, deterministic CLI focused specifically on cutover risk can provide more practical value than a broad SEO crawler when the question is:

> "Did this website migration preserve the important behavior of the old site?"

## Primary users

- web developers
- web directors
- small agencies
- WordPress maintainers
- infrastructure teams handling domain/hosting changes
- freelancers performing redesigns and CMS migrations

## Core jobs to be done

### Before launch

- compare staging against the current production site
- find missing pages and unexpected indexing directives
- validate redirect plans where they already exist
- produce a reviewable QA artifact

### Immediately after launch

- rerun the same audit against production
- detect cutover-only regressions
- save a JSON/Markdown report for handoff or incident tracking

### In CI

- run targeted audits against preview/staging environments
- fail a workflow when error-level findings exceed an agreed threshold

## v0.1 success criteria

The first release is successful when a developer can:

1. install the CLI
2. compare two public HTTP(S) sites with one command
3. crawl a bounded set of internal pages
4. receive actionable findings for the v0.1 rules
5. export JSON and Markdown reports
6. use exit codes reliably in a script or CI job
7. run the test suite without external websites

## Quality bar

A checker is not complete until:

- its behavior is documented
- it has tests for expected and edge cases
- its finding message is actionable
- its data is represented in JSON output
- it cannot accidentally mutate the audited site

## Adoption strategy

The project should earn usage by solving practical migration cases rather than by adding a large feature list.

Early adoption actions:

- test it on several real migrations with private configuration kept outside the repository
- publish anonymized examples of defects it catches
- create a GitHub Action after the CLI stabilizes
- add CMS/hosting recipes as documentation, not hard-coded vendor coupling
- label beginner-friendly issues for external contributors

## OSS health signals

Useful signals to build over time:

- tagged releases
- changelog entries
- issue discussion and triage
- external bug reports
- merged external pull requests
- npm downloads
- GitHub Action usage
- documented real-world migration cases

These signals should be a consequence of a useful project, not artificial activity created for metrics.
