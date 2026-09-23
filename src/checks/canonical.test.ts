import { describe, expect, it } from 'vitest';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkCanonical } from './canonical.js';

const context = {
  sourceOrigin: 'https://old.example.com',
  targetOrigin: 'https://new.example.net',
};

describe('SC003 canonical', () => {
  it('reports an old-host canonical as an error', () => {
    const findings = checkCanonical(
      {
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          canonical: 'https://old.example.com/company/',
        }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          canonical: 'https://old.example.com/company/',
        }),
      },
      context,
    );

    expect(findings).toMatchObject([
      {
        ruleId: 'SC003',
        severity: 'error',
        targetValue: 'https://old.example.com/company/',
      },
    ]);
  });

  it('warns when a canonical is missing, malformed, or on a different path', () => {
    const missing = checkCanonical(
      {
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          canonical: 'https://old.example.com/company/',
        }),
        target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
      },
      context,
    );
    expect(missing[0]?.severity).toBe('warning');
    expect(missing[0]?.message).toContain('missing');

    const malformed = checkCanonical(
      {
        path: '/company/',
        source: null,
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          canonical: 'http://[',
        }),
      },
      context,
    );
    expect(malformed[0]).toMatchObject({ severity: 'warning', targetValue: 'http://[' });

    const differentPath = checkCanonical(
      {
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          canonical: 'https://old.example.com/company/',
        }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          canonical: 'https://new.example.net/about/',
        }),
      },
      context,
    );
    expect(differentPath[0]?.severity).toBe('warning');
    expect(differentPath[0]?.message).toContain('/about/');
  });

  it('stays quiet when neither page has a canonical or the path is unchanged', () => {
    expect(
      checkCanonical(
        {
          path: '/company/',
          source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/' }),
          target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
        },
        context,
      ),
    ).toEqual([]);

    expect(
      checkCanonical(
        {
          path: '/company/',
          source: pageSnapshot({
            requestedUrl: 'https://old.example.com/company/',
            canonical: 'https://old.example.com/company/?lang=ja',
          }),
          target: pageSnapshot({
            requestedUrl: 'https://new.example.net/company/',
            canonical: 'https://new.example.net/company/',
          }),
        },
        context,
      ),
    ).toEqual([]);
  });
});
