import { describe, expect, it } from 'vitest';
import { normalizeRobotsDirectives, parseHtml } from './parse-html.js';

const pageUrl = 'https://example.com/blog/index.html';

describe('parseHtml', () => {
  it('extracts and normalizes migration metadata', () => {
    const html = `
      <svg><title>Icon</title><a href="/from-svg"></a></svg>
      <head>
        <base href="/blog/">
        <title>  Hello   &amp;  Welcome </title>
        <meta name="description" content="A  site &quot;about&quot; things">
        <meta name="robots" content="NoIndex, NoFollow, noindex">
        <link rel="canonical" href="post">
      </head>
      <a href="next">Next</a>
      <a href="next#section">Same</a>
      <a href="https://other.example/out">Out</a>
      <script><title>Hidden</title><a href="/hidden"></a></script>
      <!-- <a href="/commented"></a> -->
    `;

    expect(parseHtml(html, pageUrl)).toEqual({
      title: 'Hello & Welcome',
      metaDescription: 'A site "about" things',
      canonical: 'https://example.com/blog/post',
      metaRobots: 'noindex, nofollow',
      links: ['https://example.com/blog/next', 'https://other.example/out'],
    });
  });

  it('keeps a malformed canonical distinct from a missing one', () => {
    expect(parseHtml('<link rel="canonical" href="http://[">', pageUrl).canonical).toBe('http://[');
    expect(parseHtml('<p>No canonical</p>', pageUrl).canonical).toBeNull();
    expect(
      parseHtml('<title></title><meta name="description" content="  ">', pageUrl),
    ).toMatchObject({
      title: '',
      metaDescription: '',
    });
  });

  it('normalizes X-Robots-Tag style directive lists', () => {
    expect(normalizeRobotsDirectives('NOINDEX, NoFollow')).toBe('noindex, nofollow');
    expect(normalizeRobotsDirectives('all')).toBe('all');
    expect(normalizeRobotsDirectives(' , ')).toBeNull();
    expect(normalizeRobotsDirectives(null)).toBeNull();
  });
});
