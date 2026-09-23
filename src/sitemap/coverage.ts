import { normalizeHttpUrl } from '../crawl/normalize-url.js';
import { mapUrl, pathKeyForUrl } from '../compare/pair-pages.js';
import { createFinding } from '../checks/create-finding.js';
import { AuditModelError } from '../model/errors.js';
import type { Finding } from '../model/finding.js';

export function compareSitemapCoverage(input: {
  sourceOrigin: string;
  targetOrigin: string;
  sourceUrls: readonly string[];
  targetUrls: readonly string[];
}): Finding[] {
  const sourceOrigin = requireOrigin(input.sourceOrigin);
  const targetOrigin = requireOrigin(input.targetOrigin);
  const covered = new Set<string>();
  for (const rawUrl of input.targetUrls) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (normalized !== null) {
      covered.add(normalized);
    }
  }

  const findings: Finding[] = [];
  for (const sourceUrl of sameOriginUrls(input.sourceUrls, sourceOrigin)) {
    const mapped = mapUrl(sourceUrl, targetOrigin);
    const path = mapped === null ? null : pathKeyForUrl(mapped);
    if (mapped === null || path === null || covered.has(mapped)) {
      continue;
    }
    findings.push(
      createFinding({
        ruleId: 'SC008',
        severity: 'warning',
        message: `Target sitemap coverage is missing ${mapped}`,
        path,
        sourceUrl,
        targetUrl: mapped,
        sourceValue: sourceUrl,
        targetValue: mapped,
        help: 'Add this URL to the target sitemap, or confirm it should no longer be published.',
      }),
    );
  }
  return findings;
}

export function requireOrigin(origin: string): string {
  const normalized = normalizeHttpUrl(origin);
  if (normalized === null) {
    throw new AuditModelError('Sitemap origin must be an absolute http(s) URL');
  }
  const url = new URL(normalized);
  if (url.pathname !== '/' || normalized.includes('?')) {
    throw new AuditModelError('Sitemap origin must be an origin root');
  }
  return url.origin;
}

function sameOriginUrls(urls: readonly string[], origin: string): string[] {
  const unique = new Set<string>();
  for (const rawUrl of urls) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (normalized === null || new URL(normalized).origin !== origin) {
      continue;
    }
    unique.add(normalized);
  }
  return [...unique].sort(compareStrings);
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
