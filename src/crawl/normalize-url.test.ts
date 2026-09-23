import { describe, expect, it } from 'vitest';
import { normalizeHttpUrl } from './normalize-url.js';

describe('normalizeHttpUrl', () => {
  it('drops fragments and default ports', () => {
    expect(normalizeHttpUrl('https://Example.COM:443/a#x')).toBe('https://example.com/a');
    expect(normalizeHttpUrl('https://example.com/a#y')).toBe('https://example.com/a');
    expect(normalizeHttpUrl('http://Example.COM:80/a')).toBe('http://example.com/a');
    expect(normalizeHttpUrl('https://example.com:8443/a')).toBe('https://example.com:8443/a');
  });

  it('preserves trailing slashes and query order', () => {
    expect(normalizeHttpUrl('https://example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeHttpUrl('https://example.com/docs/')).toBe('https://example.com/docs/');
    expect(normalizeHttpUrl('https://example.com/a?b=1&a=2')).toBe('https://example.com/a?b=1&a=2');
    expect(normalizeHttpUrl('https://example.com/a?a=1&a=2')).toBe('https://example.com/a?a=1&a=2');
    expect(normalizeHttpUrl('https://example.com/a?')).toBe('https://example.com/a?');
  });

  it('collapses repeated slashes and resolves dot segments', () => {
    expect(normalizeHttpUrl('https://example.com/a//b')).toBe('https://example.com/a/b');
    expect(normalizeHttpUrl('https://example.com/a/./b/')).toBe('https://example.com/a/b/');
    expect(normalizeHttpUrl('https://example.com/a/../b')).toBe('https://example.com/b');
  });

  it('normalizes percent-encoding without decoding reserved characters', () => {
    expect(normalizeHttpUrl('https://example.com/%7Efoo')).toBe('https://example.com/~foo');
    expect(normalizeHttpUrl('https://example.com/~foo')).toBe('https://example.com/~foo');
    expect(normalizeHttpUrl('https://example.com/%2ffoo')).toBe('https://example.com/%2Ffoo');
    expect(normalizeHttpUrl('https://example.com/a?q=%7E')).toBe('https://example.com/a?q=~');
    expect(normalizeHttpUrl('https://example.com/a?q=1%2f2')).toBe('https://example.com/a?q=1%2F2');
  });

  it('resolves relative links and rejects non-http or credential URLs', () => {
    expect(normalizeHttpUrl('../b', 'https://example.com/a/c/')).toBe('https://example.com/a/b');
    expect(normalizeHttpUrl('/b#section', 'https://example.com/a/c/')).toBe(
      'https://example.com/b',
    );
    expect(normalizeHttpUrl('mailto:person@example.com')).toBeNull();
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpUrl('https://user:secret@example.com/a')).toBeNull();
  });
});
