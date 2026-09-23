import { describe, expect, it } from 'vitest';
import type { PageSnapshot } from '../model/page.js';
import { mapUrl, pairPages } from './pair-pages.js';

function page(url: string, title: string): PageSnapshot {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    redirectHops: [],
    contentType: 'text/html',
    xRobotsTag: null,
    internalLinks: [],
    title,
    metaDescription: null,
    canonical: null,
    metaRobots: null,
    fetchError: null,
    redirectLoop: false,
    redirectHopLimitExceeded: false,
    crossOriginRedirectStopped: false,
  };
}

describe('mapUrl', () => {
  it('keeps path and query when the destination is an origin root', () => {
    expect(
      mapUrl('https://old.example.com/services/web/?lang=ja', 'https://new.example.net/ignored'),
    ).toBeNull();
    expect(mapUrl('https://old.example.com/docs/', 'http://new.example:8080/other')).toBeNull();
    expect(mapUrl('https://old.example.com/docs', 'https://new.example.net/')).toBe(
      'https://new.example.net/docs',
    );
    expect(mapUrl('https://Example.COM:443/a#section', 'https://new.example.net/')).toBe(
      'https://new.example.net/a',
    );
    expect(mapUrl('https://old.example.com/a?', 'https://new.example.net/')).toBe(
      'https://new.example.net/a?',
    );
    expect(mapUrl('https://old.example.com/a?b=1&a=2', 'https://new.example.net/')).toBe(
      'https://new.example.net/a?b=1&a=2',
    );
  });

  it('does not map credentials into the destination URL', () => {
    expect(mapUrl('https://user:secret@old.example.com/a', 'https://new.example.net/')).toBeNull();
  });
});

describe('pairPages', () => {
  it('pairs equal paths across hosts and keeps source-only and target-only pages', () => {
    const pairs = pairPages(
      [
        page('https://old.example.com/company/?lang=ja', 'Source company'),
        page('https://old.example.com/docs', 'Source docs'),
        page('https://old.example.com/old-path', 'Source old'),
      ],
      [
        page('https://new.example.net/company/?lang=ja', 'Target company'),
        page('https://new.example.net/docs/', 'Target docs slash'),
        page('https://new.example.net/new-path', 'Target new'),
      ],
    );

    expect(pairs.map((pair) => pair.path)).toEqual([
      '/company/?lang=ja',
      '/docs',
      '/docs/',
      '/new-path',
      '/old-path',
    ]);
    expect(pairs.find((pair) => pair.path === '/company/?lang=ja')).toMatchObject({
      source: { title: 'Source company' },
      target: { title: 'Target company' },
    });
    expect(pairs.find((pair) => pair.path === '/docs')).toMatchObject({
      source: { title: 'Source docs' },
      target: null,
    });
    expect(pairs.find((pair) => pair.path === '/docs/')).toMatchObject({
      source: null,
      target: { title: 'Target docs slash' },
    });
    expect(pairs.find((pair) => pair.path === '/old-path')?.target).toBeNull();
    expect(pairs.find((pair) => pair.path === '/new-path')?.source).toBeNull();
  });

  it('treats normalized encodings as the same path and does not apply a redirect map', () => {
    const pairs = pairPages(
      [page('https://old.example.com/%7Eabout?b=1&a=2', 'Encoded')],
      [
        page('https://new.example.net/~about?b=1&a=2', 'Decoded'),
        page('https://new.example.net/~about?a=2&b=1', 'Reordered'),
        page('https://new.example.net/about', 'Different path'),
      ],
    );

    expect(pairs).toHaveLength(3);
    expect(pairs.find((pair) => pair.path === '/~about?b=1&a=2')).toMatchObject({
      source: { title: 'Encoded' },
      target: { title: 'Decoded' },
    });
    expect(pairs.find((pair) => pair.path === '/~about?a=2&b=1')?.source).toBeNull();
    expect(pairs.find((pair) => pair.path === '/about')?.source).toBeNull();
  });

  it('keeps the first page when one path is crawled twice', () => {
    const pairs = pairPages(
      [
        page('https://old.example.com/a', 'First'),
        page('https://old.example.com/a#later', 'Second'),
      ],
      [],
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.source?.title).toBe('First');
    expect(pairs[0]?.target).toBeNull();
  });
});
