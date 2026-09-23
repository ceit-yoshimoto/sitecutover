import { normalizeHttpUrl } from '../crawl/normalize-url.js';
import { copyPagePair, type PagePair, type PageSnapshot } from '../model/page.js';

export function pathKeyForUrl(url: string): string | null {
  const normalized = normalizeHttpUrl(url);
  if (normalized === null) {
    return null;
  }
  const parsed = new URL(normalized);
  if (normalized.endsWith('?') && parsed.search.length === 0) {
    return `${parsed.pathname}?`;
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function mapUrl(url: string, destinationRoot: string): string | null {
  const path = pathKeyForUrl(url);
  const destination = normalizeHttpUrl(destinationRoot);
  if (path === null || destination === null || !isOriginRoot(destination)) {
    return null;
  }
  return normalizeHttpUrl(`${new URL(destination).origin}${path}`);
}

export function pairPages(
  sourcePages: readonly PageSnapshot[],
  targetPages: readonly PageSnapshot[],
): readonly PagePair[] {
  const sourceByPath = indexPages(sourcePages);
  const targetByPath = indexPages(targetPages);
  const paths = [...new Set([...sourceByPath.keys(), ...targetByPath.keys()])].sort(compareStrings);

  return paths.map((path) =>
    copyPagePair({
      path,
      source: sourceByPath.get(path) ?? null,
      target: targetByPath.get(path) ?? null,
    }),
  );
}

function indexPages(pages: readonly PageSnapshot[]): Map<string, PageSnapshot> {
  const indexed = new Map<string, PageSnapshot>();
  for (const page of pages) {
    const path = pathKeyForUrl(page.requestedUrl);
    if (path === null || indexed.has(path)) {
      continue;
    }
    indexed.set(path, page);
  }
  return indexed;
}

function isOriginRoot(href: string): boolean {
  const url = new URL(href);
  return url.pathname === '/' && !href.includes('?');
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
