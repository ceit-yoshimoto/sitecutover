import { crawlSite, type CrawlResult } from '../crawl/crawler.js';
import { DEFAULT_MAX_SITEMAPS } from '../crawl/limits.js';
import { mapUrl, pathKeyForUrl } from './pair-pages.js';
import { checkPagePair } from '../checks/check-page.js';
import { auditInternalLinks } from '../checks/internal-links.js';
import { AuditRuntimeError } from '../model/errors.js';
import type { Finding } from '../model/finding.js';
import { copyPagePair, type PagePair, type PageSnapshot } from '../model/page.js';
import {
  createAuditReport,
  normalizeAuditConfig,
  type AuditReport,
  type FailOn,
  type ReportFormat,
} from '../model/report.js';
import { auditSitemapCoverage } from '../sitemap/audit-sitemaps.js';

export interface CompareSitesOptions {
  sourceRoot: string;
  targetRoot: string;
  maxPages: number;
  concurrency: number;
  timeoutMs: number;
  format: ReportFormat;
  failOn: FailOn;
  sitemap: boolean;
  userAgent: string;
  version: string;
  /** Used for startedAt and finishedAt. Defaults to the system clock. */
  now?: () => Date;
}

/**
 * Source-driven site comparison.
 * `pagesExamined` is the number of source pages paired for SC001–SC006.
 * `sourcePages` and `targetPages` are the numbers of pages each crawl fetched.
 */
export async function compareSites(options: CompareSitesOptions): Promise<AuditReport> {
  const now = options.now ?? ((): Date => new Date());
  const startedAt = now();
  const config = normalizeAuditConfig({
    sourceRoot: options.sourceRoot,
    targetRoot: options.targetRoot,
    maxPages: options.maxPages,
    concurrency: options.concurrency,
    timeoutMs: options.timeoutMs,
    format: options.format,
    failOn: options.failOn,
    sitemap: options.sitemap,
  });
  const fetchOptions = {
    userAgent: options.userAgent,
    timeoutMs: config.timeoutMs,
    concurrency: config.concurrency,
    maxPages: config.maxPages,
  };

  const source = await crawlSite({
    rootUrl: config.sourceRoot,
    userAgent: fetchOptions.userAgent,
    maxPages: fetchOptions.maxPages,
    concurrency: fetchOptions.concurrency,
    timeoutMs: fetchOptions.timeoutMs,
  });
  assertSourceBaseline(source);

  const target = await crawlSite({
    rootUrl: config.targetRoot,
    userAgent: fetchOptions.userAgent,
    maxPages: fetchOptions.maxPages,
    concurrency: fetchOptions.concurrency,
    timeoutMs: fetchOptions.timeoutMs,
    seedUrls: mappedTargetUrls(source, config.targetRoot),
  });

  const pairs = sourceDrivenPairs(source, target, config.targetRoot);
  const context = { sourceOrigin: config.sourceOrigin, targetOrigin: config.targetOrigin };
  const findings: Finding[] = [];
  for (const pair of pairs) {
    findings.push(...checkPagePair(pair, context));
  }
  findings.push(
    ...(await auditInternalLinks(target.pages, {
      userAgent: fetchOptions.userAgent,
      timeoutMs: fetchOptions.timeoutMs,
      concurrency: fetchOptions.concurrency,
      maxLinkFetches: fetchOptions.maxPages,
    })),
  );
  if (config.sitemap) {
    findings.push(
      ...(await auditSitemapCoverage(config.sourceOrigin, config.targetOrigin, {
        userAgent: fetchOptions.userAgent,
        timeoutMs: fetchOptions.timeoutMs,
        maxSitemaps: DEFAULT_MAX_SITEMAPS,
      })),
    );
  }

  const finishedAt = now();
  return createAuditReport({
    version: options.version,
    config,
    pagesExamined: pairs.length,
    sourcePages: source.pages.length,
    targetPages: target.pages.length,
    findings,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });
}

function assertSourceBaseline(source: CrawlResult): void {
  const root = source.pages[0];
  if (root === undefined || root.snapshot.fetchError !== null) {
    const code = root?.snapshot.fetchError?.code;
    const suffix = code === undefined ? '' : ` (${code})`;
    throw new AuditRuntimeError(`Source baseline could not be fetched${suffix}.`);
  }
}

function mappedTargetUrls(source: CrawlResult, targetRoot: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const page of source.pages) {
    const mapped = mapUrl(page.snapshot.requestedUrl, targetRoot);
    if (mapped === null || seen.has(mapped)) {
      continue;
    }
    seen.add(mapped);
    urls.push(mapped);
  }
  return urls;
}

function sourceDrivenPairs(
  source: CrawlResult,
  target: CrawlResult,
  targetRoot: string,
): PagePair[] {
  const targetByUrl = new Map<string, PageSnapshot>();
  for (const page of target.pages) {
    if (!targetByUrl.has(page.snapshot.requestedUrl)) {
      targetByUrl.set(page.snapshot.requestedUrl, page.snapshot);
    }
  }

  const pairs: PagePair[] = [];
  for (const page of source.pages) {
    const path = pathKeyForUrl(page.snapshot.requestedUrl);
    if (path === null) {
      continue;
    }
    const mapped = mapUrl(page.snapshot.requestedUrl, targetRoot);
    pairs.push(
      copyPagePair({
        path,
        source: page.snapshot,
        target: mapped === null ? null : (targetByUrl.get(mapped) ?? null),
      }),
    );
  }
  return pairs;
}
