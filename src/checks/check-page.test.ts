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
      'SC003:error',
      'SC004:error',
      'SC005:info',
    ]);
    expect(findings.every((finding) => finding.message.length > 0)).toBe(true);
  });
});
