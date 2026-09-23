import { describe, expect, it } from 'vitest';
import type { PagePair } from '../model/page.js';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkTargetStatus } from './status.js';

const context = {
  sourceOrigin: 'https://old.example.com',
  targetOrigin: 'https://new.example.net',
};

function pair(
  sourceUrl: string | null,
  targetUrl: string | null,
  targetStatus: number | null,
): PagePair {
  return {
    path: '/company/',
    source: sourceUrl === null ? null : pageSnapshot({ requestedUrl: sourceUrl, status: 200 }),
    target:
      targetUrl === null ? null : pageSnapshot({ requestedUrl: targetUrl, status: targetStatus }),
  };
}

describe('SC001 target-status', () => {
  it('reports an error when a successful source page is missing or unacceptable on the target', () => {
    const missing = checkTargetStatus(
      pair('https://old.example.com/company/', null, null),
      context,
    );
    expect(missing).toMatchObject([
      {
        ruleId: 'SC001',
        severity: 'error',
        path: '/company/',
        sourceUrl: 'https://old.example.com/company/',
        targetUrl: 'https://new.example.net/company/',
        sourceValue: 200,
      },
    ]);

    expect(
      checkTargetStatus(
        pair('https://old.example.com/company/', 'https://new.example.net/company/', 404),
        context,
      )[0],
    ).toMatchObject({
      severity: 'error',
      targetValue: 404,
      message: expect.stringContaining('404') as unknown,
    });
    expect(
      checkTargetStatus(
        pair('https://old.example.com/company/', 'https://new.example.net/company/', 410),
        context,
      )[0]?.targetValue,
    ).toBe(410);
    expect(
      checkTargetStatus(
        pair('https://old.example.com/company/', 'https://new.example.net/company/', 503),
        context,
      )[0]?.targetValue,
    ).toBe(503);
  });

  it('reports a target network failure and ignores target-only or unsuccessful source pages', () => {
    const failed = checkTargetStatus(
      {
        path: '/company/',
        source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/', status: 200 }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          status: null,
          fetchError: { code: 'TIMEOUT', message: 'The request timed out' },
        }),
      },
      context,
    );
    expect(failed[0]).toMatchObject({ severity: 'error', targetValue: 'TIMEOUT' });

    expect(
      checkTargetStatus(
        pair('https://old.example.com/company/', 'https://new.example.net/company/', 200),
        context,
      ),
    ).toEqual([]);
    expect(
      checkTargetStatus(
        {
          path: '/missing/',
          source: pageSnapshot({ requestedUrl: 'https://old.example.com/missing/', status: 404 }),
          target: pageSnapshot({ requestedUrl: 'https://new.example.net/missing/', status: 500 }),
        },
        context,
      ),
    ).toEqual([]);
    expect(
      checkTargetStatus(
        {
          path: '/only-target/',
          source: null,
          target: pageSnapshot({
            requestedUrl: 'https://new.example.net/only-target/',
            status: 404,
          }),
        },
        context,
      ),
    ).toEqual([]);
  });
});
