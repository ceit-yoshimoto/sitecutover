import type { CrawlPage } from '../crawl/crawler.js';
import { MAX_CONCURRENCY_LIMIT, MAX_LINK_FETCHES_LIMIT } from '../crawl/limits.js';
import { pathKeyForUrl } from '../compare/pair-pages.js';
import {
  DEFAULT_MAX_REDIRECT_HOPS,
  fetchPage,
  toPageSnapshot,
  type FetchPageOptions,
} from '../http/fetch-page.js';
import { AuditModelError } from '../model/errors.js';
import type { Finding } from '../model/finding.js';
import type { JsonObject } from '../model/json.js';
import type { PageSnapshot } from '../model/page.js';
import { createFinding } from './create-finding.js';

export interface InternalLinkTarget {
  url: string;
  referrers: readonly string[];
  snapshot: PageSnapshot;
}

export interface AuditInternalLinkOptions {
  userAgent: string;
  timeoutMs: number;
  concurrency: number;
  /** New fetches only. v0.1 passes the configured `--max-pages` value. */
  maxLinkFetches: number;
  maxRedirectHops?: number;
  fetchImpl?: FetchPageOptions['fetchImpl'];
}

export function checkInternalLink(target: InternalLinkTarget): Finding[] {
  const path = pathKeyForUrl(target.url);
  const referrers = uniqueSorted(target.referrers);
  if (path === null || referrers.length === 0) {
    return [];
  }

  const linkedFrom = referrers.join(', ');
  const shared = {
    ruleId: 'SC007' as const,
    path,
    targetUrl: target.url,
    referrers,
    targetValue: linkValue(target.snapshot),
  };
  const findings: Finding[] = [];

  if (isBrokenStatus(target.snapshot.status)) {
    findings.push(
      createFinding({
        ...shared,
        severity: 'error',
        message: `Internal link returned ${String(target.snapshot.status)}; linked from ${linkedFrom}`,
        help: 'Fix or remove the broken internal link before launch.',
      }),
    );
  }

  if (target.snapshot.redirectHops.length > 1) {
    findings.push(
      createFinding({
        ...shared,
        severity: 'warning',
        message: `Internal link redirect chain is longer than one hop: ${formatTrace(target.snapshot)}; linked from ${linkedFrom}`,
        help: 'Shorten the redirect chain for this internal link.',
      }),
    );
  }

  return findings;
}

export async function auditInternalLinks(
  pages: readonly CrawlPage[],
  options: AuditInternalLinkOptions,
): Promise<Finding[]> {
  const concurrency = readConcurrency(options.concurrency);
  const maxLinkFetches = readMaxLinkFetches(options.maxLinkFetches);
  const referrersByUrl = collectInternalLinks(pages);
  const crawled = new Map<string, PageSnapshot>();
  for (const page of pages) {
    if (!crawled.has(page.snapshot.requestedUrl)) {
      crawled.set(page.snapshot.requestedUrl, page.snapshot);
    }
  }

  const urls = [...referrersByUrl.keys()].sort(compareStrings);
  const missing = urls.filter((url) => !crawled.has(url));
  const toFetch = missing.slice(0, maxLinkFetches);
  const unchecked = missing.slice(maxLinkFetches);
  const fetched = new Map<string, PageSnapshot>();
  await mapPool(toFetch, concurrency, async (url) => {
    const result = await fetchPage(url, {
      userAgent: options.userAgent,
      timeoutMs: options.timeoutMs,
      maxRedirectHops: options.maxRedirectHops ?? DEFAULT_MAX_REDIRECT_HOPS,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    });
    fetched.set(url, toPageSnapshot(result));
  });

  const findings: Finding[] = [];
  for (const url of urls) {
    const snapshot = crawled.get(url) ?? fetched.get(url);
    const referrers = referrersByUrl.get(url);
    if (snapshot === undefined || referrers === undefined) {
      continue;
    }
    findings.push(...checkInternalLink({ url, referrers, snapshot }));
  }
  if (unchecked.length > 0) {
    findings.push(uncheckedLinksFinding(maxLinkFetches, unchecked));
  }
  return findings;
}

function uncheckedLinksFinding(fetchBudget: number, unchecked: readonly string[]): Finding {
  return createFinding({
    ruleId: 'SC007',
    severity: 'warning',
    message: `Internal link check limit reached; ${String(unchecked.length)} links were not checked`,
    targetValue: {
      fetchBudget,
      uncheckedCount: unchecked.length,
      uncheckedUrls: [...unchecked],
    },
    help: 'The additional internal-link fetch budget was exhausted. Raise maxPages to check the remaining URLs.',
  });
}

function collectInternalLinks(pages: readonly CrawlPage[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const page of pages) {
    const referrer = page.snapshot.requestedUrl;
    for (const link of page.snapshot.internalLinks) {
      const referrers = grouped.get(link);
      if (referrers === undefined) {
        grouped.set(link, [referrer]);
        continue;
      }
      if (!referrers.includes(referrer)) {
        referrers.push(referrer);
      }
    }
  }
  return grouped;
}

function linkValue(snapshot: PageSnapshot): JsonObject {
  return {
    status: snapshot.status,
    finalUrl: snapshot.finalUrl,
    redirectHops: snapshot.redirectHops.map((hop): JsonObject => ({
      url: hop.url,
      status: hop.status,
    })),
  };
}

function formatTrace(snapshot: PageSnapshot): string {
  const finalLabel = snapshot.crossOriginRedirectStopped
    ? 'not-requested'
    : snapshot.status === null
      ? 'failed'
      : String(snapshot.status);
  return [
    ...snapshot.redirectHops.map((hop) => `${String(hop.status)} ${hop.url}`),
    `${finalLabel} ${snapshot.finalUrl}`,
  ].join(' -> ');
}

function isBrokenStatus(status: number | null): boolean {
  return status === 404 || status === 410 || (status !== null && status >= 500 && status <= 599);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
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

function readMaxLinkFetches(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_LINK_FETCHES_LIMIT) {
    throw new AuditModelError(
      `maxLinkFetches must be an integer from 0 to ${String(MAX_LINK_FETCHES_LIMIT)}`,
    );
  }
  return value;
}

function readConcurrency(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY_LIMIT) {
    throw new AuditModelError(
      `concurrency must be an integer from 1 to ${String(MAX_CONCURRENCY_LIMIT)}`,
    );
  }
  return value;
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  let cursor = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        return;
      }
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
}
