import { describe, expect, it } from 'vitest';
import type { Finding } from '../model/finding.js';
import {
  createAuditReport,
  normalizeAuditConfig,
  serializeAuditReport,
  type AuditReport,
} from '../model/report.js';
import { renderConsoleReport } from './console.js';
import { renderJsonReport } from './json.js';
import { renderMarkdownReport } from './markdown.js';
import { renderReport } from './render.js';

const config = normalizeAuditConfig({
  sourceRoot: 'https://old.example.com',
  targetRoot: 'https://new.example.com',
  maxPages: 250,
  concurrency: 5,
  timeoutMs: 15000,
  format: 'console',
  failOn: 'error',
  sitemap: true,
});

function reportFrom(findings: readonly Finding[], pagesExamined = 124): AuditReport {
  return createAuditReport({
    version: '0.0.0',
    config,
    pagesExamined,
    sourcePages: 80,
    targetPages: 90,
    findings,
    startedAt: '2026-09-22T09:00:00.000+09:00',
    finishedAt: '2026-09-22T00:00:01.500Z',
  });
}

const sampleUrl = 'https://new.example.com/unchecked-sample';

const findings: Finding[] = [
  {
    ruleId: 'SC005',
    severity: 'info',
    message: 'Title changed',
    path: '/company/',
    sourceUrl: 'https://old.example.com/company/',
    sourceValue: 'structured-only-value',
    help: 'Titles often change during a CMS migration.',
  },
  {
    ruleId: 'SC008',
    severity: 'warning',
    message: 'Source sitemap fetch limit reached; 2 sitemaps were not checked',
    targetValue: {
      fetchBudget: 1,
      uncheckedCount: 2,
      uncheckedUrls: [sampleUrl, 'https://new.example.com/also-unchecked'],
      uncheckedUrlsTruncated: false,
    },
    help: 'The sitemap fetch budget was exhausted.',
  },
  {
    ruleId: 'SC007',
    severity: 'warning',
    message: 'Internal link returned 404',
    path: '/contact-old/',
    targetUrl: 'https://new.example.com/contact-old/',
    referrers: ['https://new.example.com/company/', 'https://new.example.com/contact/'],
  },
  {
    ruleId: 'SC001',
    severity: 'error',
    message: 'Target returned 404; source returned 200',
    path: '/foo/',
    sourceUrl: 'https://old.example.com/foo/',
    targetUrl: 'https://new.example.com/foo/',
    sourceValue: 200,
    targetValue: 404,
    help: 'Restore the target page or add a redirect.',
  },
];

describe('renderConsoleReport', () => {
  it('states that an empty audit has no findings', () => {
    const report = reportFrom([], 0);
    expect(renderConsoleReport(report)).toBe(`sitecutover 0.0.0

Source: https://old.example.com
Target: https://new.example.com
Audited: 2026-09-22T00:00:01.500Z
Pages checked: 0
Source pages: 80
Target pages: 90

ERROR 0
WARN  0
INFO  0

No findings.
`);
  });

  it('prints summary counts, urls, referrers, and help without structured values', () => {
    const text = renderConsoleReport(reportFrom(findings));
    expect(text).toBe(`sitecutover 0.0.0

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

WARN SC007 /contact-old/
  Internal link returned 404
  Target: https://new.example.com/contact-old/
  Linked from:
    - https://new.example.com/company/
    - https://new.example.com/contact/

WARN SC008
  Source sitemap fetch limit reached; 2 sitemaps were not checked
  Help: The sitemap fetch budget was exhausted.

INFO SC005 /company/
  Title changed
  Source: https://old.example.com/company/
  Help: Titles often change during a CMS migration.
`);
    expect(text).not.toContain(sampleUrl);
    expect(text).not.toContain('structured-only-value');
    expect(text).not.toContain('uncheckedUrls');
  });

  it('keeps the finding order stored on the report', () => {
    const report = reportFrom(findings);
    const reversed: AuditReport = { ...report, findings: [...report.findings].reverse() };
    const text = renderConsoleReport(reversed);
    expect(text.indexOf('INFO SC005')).toBeLessThan(text.indexOf('WARN SC008'));
    expect(text.indexOf('WARN SC008')).toBeLessThan(text.indexOf('ERROR SC001'));
    expect(renderConsoleReport(report)).toBe(
      renderConsoleReport(reportFrom([...findings].reverse())),
    );
  });
});

describe('renderJsonReport', () => {
  it('keeps the audit report, including structured values, and one trailing newline', () => {
    const report = reportFrom(findings);
    const json = renderJsonReport(report);

    expect(json).toBe(serializeAuditReport(report));
    expect(json.endsWith('\n')).toBe(true);
    expect(json.endsWith('\n\n')).toBe(false);
    expect(renderJsonReport(report)).toBe(renderJsonReport(reportFrom([...findings].reverse())));

    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      'config',
      'findings',
      'summary',
      'timestamp',
      'timing',
      'version',
    ]);
    expect(parsed['config']).toEqual({
      concurrency: 5,
      failOn: 'error',
      format: 'console',
      maxPages: 250,
      sitemap: true,
      sourceOrigin: 'https://old.example.com',
      sourceRoot: 'https://old.example.com/',
      targetOrigin: 'https://new.example.com',
      targetRoot: 'https://new.example.com/',
      timeoutMs: 15000,
    });
    expect(parsed['timing']).toEqual({
      durationMs: 1500,
      finishedAt: '2026-09-22T00:00:01.500Z',
      startedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(json).toContain(sampleUrl);
    expect(json).toContain('structured-only-value');
    expect(json).toContain('https://new.example.com/company/');
    expect(json).not.toContain('authorization');
    expect(json).not.toContain('cookie');
    expect(json).not.toContain('secret');
  });
});

describe('renderMarkdownReport', () => {
  it('states that an empty audit has no findings', () => {
    expect(renderMarkdownReport(reportFrom([], 0))).toBe(`# sitecutover report

- Version: \`0.0.0\`
- Source: \`https://old.example.com\`
- Target: \`https://new.example.com\`
- Audited: \`2026-09-22T00:00:01.500Z\`
- Pages checked: 0
- Source pages: 80
- Target pages: 90
- Errors: 0
- Warnings: 0
- Info: 0

No findings.
`);
  });

  it('renders severity sections, urls, referrers, and help', () => {
    const markdown = renderMarkdownReport(reportFrom(findings));
    expect(markdown).toContain('## Errors\n\n### SC001');
    expect(markdown).toContain('- Path: `/foo/`');
    expect(markdown).toContain('- Source: `https://old.example.com/foo/`');
    expect(markdown).toContain('- Target: `https://new.example.com/foo/`');
    expect(markdown).toContain('```\nRestore the target page or add a redirect.\n```');
    expect(markdown).toContain('## Warnings\n\n### SC007');
    expect(markdown).toContain('- Linked from:\n  - `https://new.example.com/company/`');
    expect(markdown).toContain('### SC008');
    expect(markdown).toContain('Source sitemap fetch limit reached; 2 sitemaps were not checked');
    expect(markdown).not.toContain(sampleUrl);
    expect(markdown).not.toContain('structured-only-value');
    expect(markdown.indexOf('## Errors')).toBeLessThan(markdown.indexOf('## Warnings'));
    expect(markdown.indexOf('## Warnings')).toBeLessThan(markdown.indexOf('## Info'));
    expect(renderMarkdownReport(reportFrom(findings))).toBe(
      renderMarkdownReport(reportFrom([...findings].reverse())),
    );
  });

  it('keeps markdown syntax out of user-controlled text', () => {
    const report = reportFrom([
      {
        ruleId: 'SC001',
        severity: 'error',
        message: '# Title\n<script>alert(1)</script> | cell',
        path: 'a`|b\n# Heading <tag>',
        sourceUrl: 'https://old.example.com/a<b>',
        targetUrl: 'https://new.example.com/only-target',
        help: 'Use `code` and > quote',
      },
    ]);
    const markdown = renderMarkdownReport(report);
    const outside = outsideFences(markdown);

    expect(markdown).toContain('```\n# Title\n<script>alert(1)</script> | cell\n```');
    expect(markdown).toContain('```\nUse `code` and > quote\n```');
    expect(outside).not.toContain('# Title');
    expect(outside).not.toContain('<script>');
    expect(outside).not.toContain('# Heading');
    expect(outside).not.toContain('| cell');
    expect(outside).toContain('- Source: `https://old.example.com/a<b>`');
    expect(outside.split('\n').filter((line) => line.startsWith('#'))).toEqual([
      '# sitecutover report',
      '## Errors',
      '### SC001',
    ]);
  });

  it('follows the finding order stored on the report', () => {
    const report = reportFrom(findings);
    const reversed: AuditReport = { ...report, findings: [...report.findings].reverse() };
    const markdown = renderMarkdownReport(reversed);
    expect(markdown.indexOf('## Info')).toBeLessThan(markdown.indexOf('## Errors'));
  });
});

describe('renderReport', () => {
  it('dispatches each format without changing the document', () => {
    const report = reportFrom(findings);
    expect(renderReport(report, 'console')).toBe(renderConsoleReport(report));
    expect(renderReport(report, 'json')).toBe(renderJsonReport(report));
    expect(renderReport(report, 'markdown')).toBe(renderMarkdownReport(report));
  });
});

function outsideFences(markdown: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const marker = /^(?<fence>`{3,})$/u.exec(line);
    if (marker?.groups?.fence !== undefined) {
      if (fence === null) {
        fence = marker.groups.fence;
      } else if (line === fence) {
        fence = null;
      }
      continue;
    }
    if (fence === null) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}
