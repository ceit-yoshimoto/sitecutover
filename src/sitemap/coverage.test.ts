import { describe, expect, it } from 'vitest';
import { compareSitemapCoverage } from './coverage.js';

const sourceOrigin = 'https://old.example.com';
const targetOrigin = 'https://new.example.com';

describe('compareSitemapCoverage', () => {
  it('reports no finding when the mapped URL is in the target sitemap', () => {
    const findings = compareSitemapCoverage({
      sourceOrigin,
      targetOrigin,
      sourceUrls: ['https://old.example.com/services/web/'],
      targetUrls: ['https://new.example.com/services/web/'],
    });
    expect(findings).toEqual([]);
  });

  it('warns when a source sitemap URL is missing from target coverage', () => {
    const findings = compareSitemapCoverage({
      sourceOrigin,
      targetOrigin,
      sourceUrls: ['https://old.example.com/services/web/'],
      targetUrls: [],
    });
    expect(findings).toMatchObject([
      {
        ruleId: 'SC008',
        severity: 'warning',
        path: '/services/web/',
        sourceUrl: 'https://old.example.com/services/web/',
        targetUrl: 'https://new.example.com/services/web/',
      },
    ]);
  });

  it('keeps the query string and drops the fragment before comparing', () => {
    const findings = compareSitemapCoverage({
      sourceOrigin,
      targetOrigin,
      sourceUrls: [
        'https://old.example.com/keep?q=1',
        'https://old.example.com/frag#section',
        'https://old.example.com/a//b',
      ],
      targetUrls: ['https://new.example.com/frag', 'https://new.example.com/a/b'],
    });
    expect(findings.map((finding) => finding.path)).toEqual(['/a//b', '/keep?q=1']);
    expect(findings.map((finding) => finding.targetUrl)).toEqual([
      'https://new.example.com/a//b',
      'https://new.example.com/keep?q=1',
    ]);
  });

  it('does not map sitemap URLs from another origin onto the target', () => {
    const findings = compareSitemapCoverage({
      sourceOrigin,
      targetOrigin,
      sourceUrls: ['https://cdn.example.net/asset'],
      targetUrls: [],
    });
    expect(findings).toEqual([]);
  });
});
