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

  it('reports a target network failure and ignores target-only or already-missing source pages', () => {
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
          path: '/gone/',
          source: pageSnapshot({ requestedUrl: 'https://old.example.com/gone/', status: 410 }),
          target: pageSnapshot({ requestedUrl: 'https://new.example.net/gone/', status: 404 }),
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

  it('warns when a source page cannot be used as a comparison baseline', () => {
    const cases = [
      {
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/down/',
          status: 500,
        }),
        reason: 'HTTP 500',
      },
      {
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/slow/',
          status: null,
          fetchError: { code: 'TIMEOUT', message: 'The request timed out' },
        }),
        reason: 'TIMEOUT',
      },
      {
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/loop/',
          status: 302,
          redirectLoop: true,
        }),
        reason: 'redirect loop',
      },
      {
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/hops/',
          status: 302,
          redirectHopLimitExceeded: true,
        }),
        reason: 'redirect hop limit',
      },
      {
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/away/',
          status: null,
          crossOriginRedirectStopped: true,
        }),
        reason: 'cross-origin redirect',
      },
    ];

    for (const item of cases) {
      const findings = checkTargetStatus(
        {
          path: '/child/',
          source: item.source,
          target: pageSnapshot({
            requestedUrl: 'https://new.example.net/child/',
            status: 404,
          }),
        },
        context,
      );
      expect(findings).toEqual([
        expect.objectContaining({
          ruleId: 'SC001',
          severity: 'warning',
          sourceValue: item.reason,
          message: `Source page could not be used as a comparison baseline (${item.reason}).`,
        }),
      ]);
    }
  });
});
