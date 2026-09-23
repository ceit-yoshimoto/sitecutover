import { normalizeHttpUrl } from '../crawl/normalize-url.js';

/** Sitemap URLs declared by robots.txt `Sitemap:` lines, in file order. */
export function readSitemapDirectives(body: string, robotsUrl: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of body.split(/\r\n|\n|\r/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const name = line.slice(0, colon).trim().toLowerCase();
    if (name !== 'sitemap') {
      continue;
    }
    const value = line.slice(colon + 1).trim();
    if (value.length === 0) {
      continue;
    }
    const resolved = normalizeHttpUrl(value, robotsUrl);
    if (resolved === null || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    found.push(resolved);
  }
  return found;
}
