import { describe, expect, it } from 'vitest';
import { extractLinks } from './extract-links.js';

describe('extractLinks', () => {
  it('reads anchor and area hrefs and decodes entities', () => {
    const html = `
      <A HREF="/Docs">Docs</A>
      <a class="next" href='/post?a=1&amp;b=2'>Post</a>
      <a href=/plain>Plain</a>
      <area href="/map">
      <noscript><a href="/fallback">Fallback</a></noscript>
    `;

    expect(extractLinks(html)).toEqual(['/Docs', '/post?a=1&b=2', '/plain', '/map', '/fallback']);
  });

  it('ignores links inside scripts, styles, and comments', () => {
    const html = `
      <script>var html = '<a href="/from-script">x</a>';</script>
      <style>a[href="/from-style"]{}</style>
      <!-- <a href="/from-comment">x</a> -->
      <a href="/real">Real</a>
    `;

    expect(extractLinks(html)).toEqual(['/real']);
  });
});
