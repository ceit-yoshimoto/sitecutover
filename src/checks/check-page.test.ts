import { describe, expect, it } from 'vitest';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkPagePair } from './check-page.js';

describe('checkPagePair', () => {
  it('returns structured findings for the page rules', () => {
    const findings = checkPagePair(
      {
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          title: 'Old title',
          canonical: 'https://old.example.com/company/',
        }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          status: 404,
          title: 'New title',
          canonical: 'https://old.example.com/company/',
          metaRobots: 'noindex',
        }),
      },
      {
        sourceOrigin: 'https://old.example.com',
        targetOrigin: 'https://new.example.net',
      },
    );

    expect(findings.map((finding) => `${finding.ruleId}:${finding.severity}`)).toEqual([
      'SC001:error',
    ]);
    expect(findings.every((finding) => finding.message.length > 0)).toBe(true);
  });

  it('does not read metadata from an unsuccessful target document', () => {
    const context = {
      sourceOrigin: 'https://old.example.com',
      targetOrigin: 'https://new.example.net',
    };
    const source = pageSnapshot({
      requestedUrl: 'https://old.example.com/old-page/',
      title: 'Old page',
      metaDescription: 'Old description',
      canonical: 'https://old.example.com/old-page/',
    });
    const errorDocument = {
      title: 'Not Found',
      metaDescription: 'Missing page',
      canonical: 'https://new.example.net/old-page/',
      metaRobots: 'noindex',
    };

    for (const status of [404, 410, 500]) {
      const findings = checkPagePair(
        {
          path: '/old-page/',
          source,
          target: pageSnapshot({
            requestedUrl: 'https://new.example.net/old-page/',
            status,
            ...errorDocument,
          }),
        },
        context,
      );
      expect(findings.map((finding) => finding.ruleId)).toEqual(['SC001']);
    }

    const failed = checkPagePair(
      {
        path: '/old-page/',
        source,
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/old-page/',
          status: null,
          fetchError: { code: 'TIMEOUT', message: 'The request timed out' },
          ...errorDocument,
        }),
      },
      context,
    );
    expect(failed.map((finding) => finding.ruleId)).toEqual(['SC001']);
  });

  it('still compares metadata when the target page is usable HTML', () => {
    const findings = checkPagePair(
      {
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          title: 'Old title',
          metaDescription: 'Old description',
          canonical: 'https://old.example.com/company/',
        }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          status: 200,
          title: 'New title',
          metaDescription: 'New description',
          canonical: 'https://new.example.net/other/',
          metaRobots: 'noindex',
        }),
      },
      {
        sourceOrigin: 'https://old.example.com',
        targetOrigin: 'https://new.example.net',
      },
    );
    expect(findings.map((finding) => finding.ruleId).sort()).toEqual([
      'SC003',
      'SC004',
      'SC005',
      'SC006',
    ]);
  });
});
