import { describe, expect, it } from 'vitest';
import { readSitemapDirectives } from './robots.js';

describe('readSitemapDirectives', () => {
  it('accepts case, whitespace, comments, and relative URLs', () => {
    const body = [
      '# Sitemap: https://evil.example/secret.xml',
      'User-agent: *',
      '  sItEmAp:   /custom.xml',
      'Sitemap:https://old.example.com/absolute.xml',
      'SITEMAP: /custom.xml',
      'Sitemap:',
      '',
    ].join('\n');

    expect(readSitemapDirectives(body, 'https://old.example.com/robots.txt')).toEqual([
      'https://old.example.com/custom.xml',
      'https://old.example.com/absolute.xml',
    ]);
  });
});
