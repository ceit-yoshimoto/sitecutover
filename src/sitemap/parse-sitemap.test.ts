import { describe, expect, it } from 'vitest';
import { parseSitemapXml } from './parse-sitemap.js';

const xmlns = 'http://www.sitemaps.org/schemas/sitemap/0.9';

describe('parseSitemapXml', () => {
  it('reads locs from a urlset', () => {
    const parsed = parseSitemapXml(`<?xml version="1.0"?>
      <urlset xmlns="${xmlns}">
        <url><loc>https://example.com/a/</loc></url>
        <url><loc>https://example.com/b/?q=1&amp;x=2</loc></url>
      </urlset>`);
    expect(parsed).toEqual({
      kind: 'urlset',
      locs: ['https://example.com/a/', 'https://example.com/b/?q=1&x=2'],
    });
  });

  it('reads child sitemap locs from a sitemap index', () => {
    const parsed = parseSitemapXml(`<sitemapindex xmlns="${xmlns}">
      <sitemap><loc>https://example.com/child.xml</loc></sitemap>
    </sitemapindex>`);
    expect(parsed).toEqual({
      kind: 'sitemapindex',
      locs: ['https://example.com/child.xml'],
    });
  });

  it('accepts namespace prefixes, comments, and CDATA', () => {
    const parsed = parseSitemapXml(`<?xml version="1.0"?>
      <!-- Sitemap: https://evil.example/secret.xml -->
      <sm:urlset xmlns:sm="${xmlns}">
        <sm:url><sm:loc><![CDATA[https://example.com/cdata/]]></sm:loc></sm:url>
      </sm:urlset>`);
    expect(parsed).toEqual({
      kind: 'urlset',
      locs: ['https://example.com/cdata/'],
    });
  });

  it('treats an empty urlset as a valid sitemap', () => {
    expect(parseSitemapXml(`<urlset xmlns="${xmlns}"></urlset>`)).toEqual({
      kind: 'urlset',
      locs: [],
    });
  });

  it('rejects HTML, DOCTYPE, unknown entities, and truncated XML', () => {
    expect(parseSitemapXml('<html><body>nope</body></html>')).toBeNull();
    expect(
      parseSitemapXml('<!DOCTYPE urlset SYSTEM "http://127.0.0.1/secret.dtd"><urlset></urlset>'),
    ).toBeNull();
    expect(
      parseSitemapXml('<urlset><url><loc>https://example.com/&unknown;</loc></url></urlset>'),
    ).toBeNull();
    expect(parseSitemapXml('<urlset><url><loc>https://example.com/</loc>')).toBeNull();
    expect(parseSitemapXml('<<<')).toBeNull();
  });
});
