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

  it('keeps parsing when attributes contain aria-label, data-*, and http-equiv', () => {
    const html = `
      <meta http-equiv="refresh" content="0;url=/skipped">
      <meta http-equiv="content-type" content="text/html; charset=utf-8">
      <a aria-label="Next > page" data-id="42" data-track="a>b" href="/next">Next</a>
    `;

    expect(parseHtml(html, pageUrl)).toMatchObject({
      links: ['https://example.com/next'],
      metaDescription: null,
    });
  });

  it('reads a quoted attribute that contains >', () => {
    const html = `<a title="keep > this" href="/ok">Ok</a><a href="/after">After</a>`;
    expect(parseHtml(html, pageUrl).links).toEqual([
      'https://example.com/ok',
      'https://example.com/after',
    ]);
  });

  it('recovers links from malformed markup', () => {
    const html = `<a href="/first"><div <span><a href="/second">Second</a>`;
    expect(parseHtml(html, pageUrl).links).toEqual([
      'https://example.com/first',
      'https://example.com/second',
    ]);
  });

  it('reads mixed-case tags and unquoted attributes', () => {
    const html = `<TITLE>Mixed</TITLE><A HREF=/Docs>Docs</A>`;
    expect(parseHtml(html, pageUrl)).toMatchObject({
      title: 'Mixed',
      links: ['https://example.com/Docs'],
    });
  });

  it('keeps the first value when an attribute is duplicated', () => {
    const html = `<a href="/first" href="/second">One</a>`;
    expect(parseHtml(html, pageUrl).links).toEqual(['https://example.com/first']);
  });

  it('does not treat script, style, or SVG contents as HTML elements', () => {
    const html = `
      <script>var html = '<a href="/from-script"></a><title>Script</title>';</script>
      <style>a[href="/from-style"]{}</style>
      <svg><title>Icon</title><a href="/from-svg"></a></svg>
      <div x-data="{ open: true }" @click="open = false" :class="{ on: open }">
        <a href="/real">Real</a>
      </div>
    `;

    expect(parseHtml(html, pageUrl)).toMatchObject({
      title: null,
      links: ['https://example.com/real'],
    });
  });
});
