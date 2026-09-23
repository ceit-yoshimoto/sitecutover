import { crawlSite, type CrawlResult } from '../crawl/crawler.js';
import { DEFAULT_MAX_SITEMAPS } from '../crawl/limits.js';
import { mapUrl, pathKeyForUrl } from './pair-pages.js';
import { checkPagePair } from '../checks/check-page.js';
import { auditInternalLinks } from '../checks/internal-links.js';
import { checkTargetStatus } from '../checks/status.js';
import {
  isKnownMissingSource,
  isSourceComparisonBaseline,
  sourceRootBaselineMessage,
} from '../checks/source-baseline.js';
import { AuditRuntimeError } from '../model/errors.js';
import type { Finding } from '../model/finding.js';
import { copyPagePair, type PageSnapshot } from '../model/page.js';
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
 * `pagesExamined` is the number of source pages whose final response is a 2xx baseline
 * and were evaluated by SC001–SC006.
 * `sourcePages` and `targetPages` are the numbers of page snapshots each crawl attempted.
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

  const context = { sourceOrigin: config.sourceOrigin, targetOrigin: config.targetOrigin };
  const findings: Finding[] = [];
  let pagesExamined = 0;
  for (const page of source.pages) {
    const path = pathKeyForUrl(page.snapshot.requestedUrl);
    if (path === null || isKnownMissingSource(page.snapshot)) {
      continue;
    }
    if (!isSourceComparisonBaseline(page.snapshot)) {
      findings.push(
        ...checkTargetStatus(copyPagePair({ path, source: page.snapshot, target: null }), context),
      );
      continue;
    }
    pagesExamined += 1;
    const mapped = mapUrl(page.snapshot.requestedUrl, config.targetRoot);
    findings.push(
      ...checkPagePair(
        copyPagePair({
          path,
          source: page.snapshot,
          target: mapped === null ? null : (targetSnapshot(target, mapped) ?? null),
        }),
        context,
      ),
    );
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
    pagesExamined,
    sourcePages: source.pages.length,
    targetPages: target.pages.length,
    findings,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });
}

function assertSourceBaseline(source: CrawlResult): void {
  const root = source.pages[0];
  if (root === undefined || !isSourceComparisonBaseline(root.snapshot)) {
    throw new AuditRuntimeError(sourceRootBaselineMessage(root?.snapshot));
  }
}

function mappedTargetUrls(source: CrawlResult, targetRoot: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const page of source.pages) {
    if (!isSourceComparisonBaseline(page.snapshot)) {
      continue;
    }
    const mapped = mapUrl(page.snapshot.requestedUrl, targetRoot);
    if (mapped === null || seen.has(mapped)) {
      continue;
    }
    seen.add(mapped);
    urls.push(mapped);
  }
  return urls;
}

function targetSnapshot(target: CrawlResult, url: string): PageSnapshot | undefined {
  for (const page of target.pages) {
    if (page.snapshot.requestedUrl === url) {
      return page.snapshot;
    }
  }
  return undefined;
}
