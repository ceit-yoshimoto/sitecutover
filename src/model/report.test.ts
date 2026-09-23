import { describe, expect, it } from 'vitest';
import { AuditModelError } from './errors.js';
import { RULE_IDS, RULE_NAMES, type Finding } from './finding.js';
import {
  createAuditReport,
  normalizeAuditConfig,
  serializeAuditReport,
  type AuditConfig,
} from './report.js';

const configInput = {
  sourceRoot: 'https://old.example.com',
  targetRoot: 'https://new.example.com',
  maxPages: 250,
  concurrency: 5,
  timeoutMs: 15000,
  format: 'console',
  failOn: 'error',
  sitemap: true,
} as const;

function reportFrom(
  findings: readonly Finding[],
  config: AuditConfig = normalizeAuditConfig(configInput),
) {
  return createAuditReport({
    version: '0.0.0',
    config,
    pagesExamined: 2,
    sourcePages: 2,
    targetPages: 1,
    findings,
    startedAt: '2026-09-22T09:00:00.000+09:00',
    finishedAt: '2026-09-22T00:00:01.500Z',
  });
}

describe('audit report model', () => {
  it('lists the v0.1 rule ids', () => {
    expect(RULE_IDS).toEqual([
      'SC001',
      'SC002',
      'SC003',
      'SC004',
      'SC005',
      'SC006',
      'SC007',
      'SC008',
    ]);
    expect(RULE_NAMES.SC001).toBe('target-status');
    expect(RULE_NAMES.SC004).toBe('indexing-directives');
    expect(RULE_NAMES.SC008).toBe('sitemap-coverage');
  });

  it('serializes a deterministic report and derives severity counts', () => {
    const findings: Finding[] = [
      {
        ruleId: 'SC005',
        severity: 'info',
        message: 'Title changed',
        path: '/company/',
        sourceValue: { zeta: 1, alpha: 'Old title' },
        targetValue: 'New title',
        help: 'Titles often change during a CMS migration.',
      },
      {
        ruleId: 'SC001',
        severity: 'error',
        message: 'Target returned 404',
        path: '/column/foo/',
        sourceUrl: 'https://old.example.com/column/foo/',
        targetUrl: 'https://new.example.com/column/foo/',
        sourceValue: 200,
        targetValue: 404,
      },
      {
        ruleId: 'SC003',
        severity: 'warning',
        message: 'Canonical path differs',
        path: '/a/',
      },
    ];

    const json = serializeAuditReport(reportFrom(findings));

    expect(json).toBe(`{
  "config": {
    "concurrency": 5,
    "failOn": "error",
    "format": "console",
    "maxPages": 250,
    "sitemap": true,
    "sourceOrigin": "https://old.example.com",
    "sourceRoot": "https://old.example.com/",
    "targetOrigin": "https://new.example.com",
    "targetRoot": "https://new.example.com/",
    "timeoutMs": 15000
  },
  "findings": [
    {
      "message": "Target returned 404",
      "path": "/column/foo/",
      "ruleId": "SC001",
      "severity": "error",
      "sourceUrl": "https://old.example.com/column/foo/",
      "sourceValue": 200,
      "targetUrl": "https://new.example.com/column/foo/",
      "targetValue": 404
    },
    {
      "message": "Canonical path differs",
      "path": "/a/",
      "ruleId": "SC003",
      "severity": "warning"
    },
    {
      "help": "Titles often change during a CMS migration.",
      "message": "Title changed",
      "path": "/company/",
      "ruleId": "SC005",
      "severity": "info",
      "sourceValue": {
        "alpha": "Old title",
        "zeta": 1
      },
      "targetValue": "New title"
    }
  ],
  "summary": {
    "counts": {
      "error": 1,
      "info": 1,
      "warning": 1
    },
    "pagesExamined": 2,
    "sourceOrigin": "https://old.example.com",
    "sourcePages": 2,
    "targetOrigin": "https://new.example.com",
    "targetPages": 1
  },
  "timestamp": "2026-09-22T00:00:01.500Z",
  "timing": {
    "durationMs": 1500,
    "finishedAt": "2026-09-22T00:00:01.500Z",
    "startedAt": "2026-09-22T00:00:00.000Z"
  },
  "version": "0.0.0"
}
`);
    expect(serializeAuditReport(reportFrom(findings))).toBe(json);
  });

  it('drops secret-bearing config fields', () => {
    const config = normalizeAuditConfig({
      ...configInput,
      authorization: 'Bearer secret-token',
      cookie: 'session=abc',
      outputPath: '/Users/someone/secret-report.md',
      headers: { 'x-api-key': 'secret-key' },
    });
    const dirty = {
      ...config,
      authorization: 'Bearer secret-token',
    } as AuditConfig;

    const json = serializeAuditReport(reportFrom([], dirty));

    expect(json).not.toContain('secret-token');
    expect(json).not.toContain('session=abc');
    expect(json).not.toContain('secret-key');
    expect(json).not.toContain('outputPath');
    expect(json).not.toContain('authorization');
    expect(JSON.parse(json)).toMatchObject({
      config: {
        sourceOrigin: 'https://old.example.com',
        targetOrigin: 'https://new.example.com',
      },
    });
  });

  it('accepts origin roots and rejects a path, query, or credentials', () => {
    const config = normalizeAuditConfig({
      ...configInput,
      sourceRoot: 'https://old.example.com:443/#section',
      targetRoot: 'http://new.example.com:8080/',
    });

    expect(config.sourceRoot).toBe('https://old.example.com/');
    expect(config.sourceOrigin).toBe('https://old.example.com');
    expect(config.targetRoot).toBe('http://new.example.com:8080/');
    expect(config.targetOrigin).toBe('http://new.example.com:8080');

    expect(() =>
      normalizeAuditConfig({
        ...configInput,
        sourceRoot: 'https://old.example.com/blog/',
      }),
    ).toThrow(/origin root/);
    expect(() =>
      normalizeAuditConfig({
        ...configInput,
        targetRoot: 'http://new.example.com/?lang=ja',
      }),
    ).toThrow(/origin root/);
    expect(() =>
      normalizeAuditConfig({
        ...configInput,
        sourceRoot: 'https://user:secret@old.example.com/',
      }),
    ).toThrow(AuditModelError);
    expect(() =>
      normalizeAuditConfig({
        ...configInput,
        targetRoot: 'ftp://files.example.com/',
      }),
    ).toThrow(/http or https/);
  });

  it('rejects an unfinished time range', () => {
    expect(() =>
      createAuditReport({
        version: '0.0.0',
        config: normalizeAuditConfig(configInput),
        pagesExamined: 0,
        sourcePages: 0,
        targetPages: 0,
        findings: [],
        startedAt: '2026-09-22T00:00:02.000Z',
        finishedAt: '2026-09-22T00:00:01.000Z',
      }),
    ).toThrow(/finishedAt/);
  });
});
