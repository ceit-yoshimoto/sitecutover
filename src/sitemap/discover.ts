import { normalizeHttpUrl } from '../crawl/normalize-url.js';
import { MAX_SITEMAPS_LIMIT } from '../crawl/limits.js';
import {
  DEFAULT_MAX_REDIRECT_HOPS,
  fetchPage,
  type FetchPageOptions,
  type FetchResult,
} from '../http/fetch-page.js';
import { AuditModelError } from '../model/errors.js';
import { requireOrigin } from './coverage.js';
import { SITEMAP_MAX_BODY_BYTES } from './limits.js';
import { parseSitemapXml } from './parse-sitemap.js';
import { readSitemapDirectives } from './robots.js';

const WELL_KNOWN_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'] as const;

export type SitemapCandidateSource = 'robots' | 'well-known' | 'index';

export type SitemapFailureReason =
  'malformed' | 'unreadable' | 'cross-origin' | 'cross-origin-redirect' | 'robots-unreadable';

export interface SitemapFailure {
  url: string;
  reason: SitemapFailureReason;
  status?: number;
  finalUrl?: string;
  errorCode?: string;
  redirectLoop?: boolean;
  redirectHopLimitExceeded?: boolean;
}

export interface SitemapDiscovery {
  pageUrls: readonly string[];
  failures: readonly SitemapFailure[];
  uncheckedUrls: readonly string[];
  fetchBudget: number;
  /** Sitemap document requests. The robots.txt request is not included. */
  requestCount: number;
}

export interface DiscoverSitemapOptions {
  userAgent: string;
  timeoutMs: number;
  maxSitemaps: number;
  maxRedirectHops?: number;
  fetchImpl?: FetchPageOptions['fetchImpl'];
}

interface Candidate {
  url: string;
  source: SitemapCandidateSource;
}

/**
 * Fetches one origin's sitemap documents.
 * robots.txt is read for Sitemap directives, then the well-known paths are tried.
 * Child sitemaps stay on this origin. Each sitemap URL is requested at most once.
 */
export async function discoverSitemaps(
  origin: string,
  options: DiscoverSitemapOptions,
): Promise<SitemapDiscovery> {
  const siteOrigin = requireOrigin(origin);
  const maxSitemaps = readMaxSitemaps(options.maxSitemaps);
  const settings = fetchSettings(options);
  const queue: Candidate[] = [];
  const known = new Set<string>();
  const failures: SitemapFailure[] = [];
  const pageUrls: string[] = [];
  const seenPages = new Set<string>();

  const robotsUrl = new URL('/robots.txt', siteOrigin).href;
  const robots = await fetchPage(robotsUrl, settings);
  const robotsFailure = robotsDiscoveryFailure(robotsUrl, robots);
  if (robotsFailure !== null) {
    failures.push(robotsFailure);
  }
  if (isReadableRobots(robots)) {
    for (const directive of readSitemapDirectives(robots.body ?? '', robotsUrl)) {
      consider(directive, 'robots');
    }
  }
  for (const path of WELL_KNOWN_PATHS) {
    consider(new URL(path, siteOrigin).href, 'well-known');
  }

  let requestCount = 0;
  while (queue.length > 0 && requestCount < maxSitemaps) {
    const candidate = queue.shift();
    if (candidate === undefined) {
      break;
    }
    requestCount += 1;
    const result = await fetchPage(candidate.url, settings);
    const outcome = classifyResponse(result, candidate.source);
    if (outcome === 'skip') {
      continue;
    }
    if (outcome === 'unreadable' || outcome === 'cross-origin-redirect') {
      failures.push(failureFor(candidate.url, outcome, result));
      continue;
    }
    const parsed = parseSitemapXml(result.body ?? '');
    if (parsed === null) {
      failures.push({ url: candidate.url, reason: 'malformed' });
      continue;
    }
    for (const loc of parsed.locs) {
      const resolved = normalizeHttpUrl(loc, result.finalUrl);
      if (resolved === null) {
        continue;
      }
      if (parsed.kind === 'sitemapindex') {
        consider(resolved, 'index');
        continue;
      }
      if (new URL(resolved).origin !== siteOrigin || seenPages.has(resolved)) {
        continue;
      }
      seenPages.add(resolved);
      pageUrls.push(resolved);
    }
  }

  return {
    pageUrls,
    failures,
    uncheckedUrls: queue.map((candidate) => candidate.url),
    fetchBudget: maxSitemaps,
    requestCount,
  };

  function consider(rawUrl: string, source: SitemapCandidateSource): void {
    const normalized = normalizeHttpUrl(rawUrl);
    if (normalized === null || known.has(normalized)) {
      return;
    }
    known.add(normalized);
    if (new URL(normalized).origin !== siteOrigin) {
      failures.push({ url: normalized, reason: 'cross-origin' });
      return;
    }
    queue.push({ url: normalized, source });
  }
}

function robotsDiscoveryFailure(robotsUrl: string, result: FetchResult): SitemapFailure | null {
  if (result.status === 404 || result.status === 410 || isReadableRobots(result)) {
    return null;
  }
  return failureFor(robotsUrl, 'robots-unreadable', result);
}

function isReadableRobots(result: FetchResult): boolean {
  return (
    !result.crossOriginRedirectStopped &&
    result.fetchError === null &&
    result.status !== null &&
    result.status >= 200 &&
    result.status < 300 &&
    result.body !== null
  );
}

function classifyResponse(
  result: FetchResult,
  source: SitemapCandidateSource,
): 'ok' | 'skip' | 'unreadable' | 'cross-origin-redirect' {
  if (result.crossOriginRedirectStopped) {
    return 'cross-origin-redirect';
  }
  if (result.status === 404 || result.status === 410) {
    return 'skip';
  }
  if (couldNotCheckSitemap(result)) {
    return 'unreadable';
  }
  if (!looksLikeSitemap(result.contentType)) {
    return source === 'well-known' ? 'skip' : 'unreadable';
  }
  if (result.body === null) {
    return 'unreadable';
  }
  return 'ok';
}

function couldNotCheckSitemap(result: FetchResult): boolean {
  return (
    result.fetchError !== null ||
    result.redirectLoop ||
    result.redirectHopLimitExceeded ||
    result.status === null ||
    result.status < 200 ||
    result.status >= 300
  );
}

function looksLikeSitemap(contentType: string | null): boolean {
  if (contentType === null) {
    return true;
  }
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    mime === 'text/xml' ||
    mime === 'application/xml' ||
    mime === 'text/plain' ||
    mime.endsWith('+xml')
  );
}

function failureFor(
  url: string,
  reason: 'unreadable' | 'cross-origin-redirect' | 'robots-unreadable',
  result: FetchResult,
): SitemapFailure {
  const failure: SitemapFailure = { url, reason };
  if (typeof result.status === 'number') {
    failure.status = result.status;
  }
  if (result.fetchError !== null) {
    failure.errorCode = result.fetchError.code;
  }
  if (result.redirectLoop) {
    failure.redirectLoop = true;
  }
  if (result.redirectHopLimitExceeded) {
    failure.redirectHopLimitExceeded = true;
  }
  if (reason === 'cross-origin-redirect' || result.crossOriginRedirectStopped) {
    failure.finalUrl = result.finalUrl;
  }
  return failure;
}

function fetchSettings(options: DiscoverSitemapOptions): FetchPageOptions {
  return {
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    maxRedirectHops: options.maxRedirectHops ?? DEFAULT_MAX_REDIRECT_HOPS,
    maxBodyBytes: SITEMAP_MAX_BODY_BYTES,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  };
}

function readMaxSitemaps(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SITEMAPS_LIMIT) {
    throw new AuditModelError(
      `maxSitemaps must be an integer from 0 to ${String(MAX_SITEMAPS_LIMIT)}`,
    );
  }
  return value;
}
