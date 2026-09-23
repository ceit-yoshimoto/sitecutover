import { describe, expect, it } from 'vitest';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkRedirectChain } from './redirects.js';

const context = {
  sourceOrigin: 'https://old.example.com',
  targetOrigin: 'https://new.example.net',
};

describe('SC002 redirect-chain', () => {
  it('reports loops and hop-limit failures with the trace', () => {
    const loop = checkRedirectChain(
      {
        path: '/a',
        source: null,
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/a',
          finalUrl: 'https://new.example.net/b',
          status: 302,
          redirectLoop: true,
          redirectHops: [
            { url: 'https://new.example.net/a', status: 302 },
            { url: 'https://new.example.net/b', status: 302 },
          ],
        }),
      },
      context,
    );
    expect(loop[0]).toMatchObject({
      ruleId: 'SC002',
      severity: 'error',
      message: expect.stringContaining('https://new.example.net/a') as unknown,
    });
    expect(loop[0]?.targetValue).toEqual([
      { url: 'https://new.example.net/a', status: 302 },
      { url: 'https://new.example.net/b', status: 302 },
      { url: 'https://new.example.net/b', status: 302 },
    ]);

    const limited = checkRedirectChain(
      {
        path: '/a',
        source: null,
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/a',
          redirectHopLimitExceeded: true,
          status: 302,
          redirectHops: [{ url: 'https://new.example.net/a', status: 302 }],
        }),
      },
      context,
    );
    expect(limited[0]?.severity).toBe('error');
    expect(limited[0]?.message).toContain('hop limit');
  });

  it('warns for a chain longer than one hop and for a final external origin', () => {
    const chain = checkRedirectChain(
      {
        path: '/a',
        source: null,
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/a',
          finalUrl: 'https://new.example.net/c',
          status: 200,
          redirectHops: [
            { url: 'https://new.example.net/a', status: 301 },
            { url: 'https://new.example.net/b', status: 302 },
          ],
        }),
      },
      context,
    );
    expect(chain.map((finding) => finding.severity)).toEqual(['warning']);

    const external = checkRedirectChain(
      {
        path: '/a',
        source: null,
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/a',
          finalUrl: 'https://cdn.example.org/a',
          status: 200,
          redirectHops: [{ url: 'https://new.example.net/a', status: 301 }],
        }),
      },
      context,
    );
    expect(external).toHaveLength(1);
    expect(external[0]).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('cdn.example.org') as unknown,
    });

    expect(
      checkRedirectChain(
        {
          path: '/a',
          source: null,
          target: pageSnapshot({
            requestedUrl: 'https://new.example.net/a',
            finalUrl: 'https://new.example.net/b',
            redirectHops: [{ url: 'https://new.example.net/a', status: 301 }],
          }),
        },
        context,
      ),
    ).toEqual([]);
  });
});
