import { normalizeHttpUrl } from './normalize-url.js';
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_PAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_CONCURRENCY_LIMIT,
  MAX_PAGES_LIMIT,
} from './limits.js';
import { AuditModelError } from '../model/errors.js';
import { copyPageSnapshot, type PageSnapshot } from '../model/page.js';
import { isHtmlMime } from '../parse/html-mime.js';
import { normalizeRobotsDirectives, parseHtml, type ParsedHtml } from '../parse/parse-html.js';
import {
  DEFAULT_MAX_REDIRECT_HOPS,
  fetchPage,
  MAX_REDIRECT_HOPS_LIMIT,
  MAX_TIMEOUT_MS_LIMIT,
  toPageSnapshot,
  type FetchResult,
} from '../http/fetch-page.js';

export interface CrawlOptions {
  rootUrl: string;
  userAgent: string;
  maxPages?: number;
  concurrency?: number;
  timeoutMs?: number;
  maxRedirectHops?: number;
}

export interface CrawlPage {
  snapshot: PageSnapshot;
  externalLinks: readonly string[];
}

export interface CrawlResult {
  origin: string;
  pages: readonly CrawlPage[];
}

interface ResolvedCrawlOptions {
  rootUrl: string;
  userAgent: string;
  maxPages: number;
  concurrency: number;
  timeoutMs: number;
  maxRedirectHops: number;
}

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const settings = resolveCrawlOptions(options);
  const root = normalizeHttpUrl(settings.rootUrl);
  if (root === null) {
    const fetched = await fetchPage(settings.rootUrl, settings);
    return {
      origin: '',
      pages: [toCrawlPage(fetched, [], [], null)],
    };
  }

  const origin = new URL(root).origin;
  const queue = [root];
  const seen = new Set<string>([root]);
  const pages: Array<CrawlPage | undefined> = [];
  let cursor = 0;
  let active = 0;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof Error ? error : new Error('Crawl failed'));
    };

    const pump = (): void => {
      while (active < settings.concurrency && cursor < queue.length && cursor < settings.maxPages) {
        const index = cursor;
        const url = queue[index];
        if (url === undefined) {
          break;
        }
        cursor += 1;
        active += 1;
        void fetchPage(url, settings)
          .then((fetched) => {
            const inspected = inspectPage(fetched, origin, settings.maxPages, seen, queue);
            pages[index] = toCrawlPage(
              fetched,
              inspected.internalLinks,
              inspected.externalLinks,
              inspected.parsed,
            );
          })
          .catch(fail)
          .finally(() => {
            active -= 1;
            if (settled) {
              return;
            }
            pump();
            if (active === 0) {
              settled = true;
              resolve();
            }
          });
      }
    };

    pump();
    if (active === 0) {
      settled = true;
      resolve();
    }
  });

  return {
    origin,
    pages: pages.filter((page): page is CrawlPage => page !== undefined),
  };
}

function inspectPage(
  fetched: FetchResult,
  origin: string,
  maxPages: number,
  seen: Set<string>,
  queue: string[],
): { internalLinks: string[]; externalLinks: string[]; parsed: ParsedHtml | null } {
  if (fetched.body === null || !isHtmlMime(fetched.contentType)) {
    return { internalLinks: [], externalLinks: [], parsed: null };
  }

  let finalUrl: URL;
  try {
    finalUrl = new URL(fetched.finalUrl);
  } catch {
    return { internalLinks: [], externalLinks: [], parsed: null };
  }

  const parsed = parseHtml(fetched.body, fetched.finalUrl);
  if (finalUrl.origin !== origin) {
    return { internalLinks: [], externalLinks: [], parsed };
  }

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const seenInternal = new Set<string>();
  const seenExternal = new Set<string>();

  for (const normalized of parsed.links) {
    const linkOrigin = new URL(normalized).origin;
    if (linkOrigin === origin) {
      if (!seenInternal.has(normalized)) {
        seenInternal.add(normalized);
        internalLinks.push(normalized);
      }
      if (!seen.has(normalized) && seen.size < maxPages) {
        seen.add(normalized);
        queue.push(normalized);
      }
      continue;
    }
    if (!seenExternal.has(normalized)) {
      seenExternal.add(normalized);
      externalLinks.push(normalized);
    }
  }

  return { internalLinks, externalLinks, parsed };
}

function toCrawlPage(
  fetched: FetchResult,
  internalLinks: readonly string[],
  externalLinks: readonly string[],
  parsed: ParsedHtml | null,
): CrawlPage {
  const snapshot = toPageSnapshot(fetched);
  return {
    snapshot: copyPageSnapshot({
      ...snapshot,
      internalLinks,
      title: parsed?.title ?? null,
      metaDescription: parsed?.metaDescription ?? null,
      canonical: parsed?.canonical ?? null,
      metaRobots: parsed?.metaRobots ?? null,
      xRobotsTag: normalizeRobotsDirectives(snapshot.xRobotsTag),
    }),
    externalLinks: [...externalLinks],
  };
}

function resolveCrawlOptions(options: CrawlOptions): ResolvedCrawlOptions {
  return {
    rootUrl: options.rootUrl,
    userAgent: readUserAgent(options.userAgent),
    maxPages: readBoundedInteger(
      options.maxPages ?? DEFAULT_MAX_PAGES,
      'maxPages',
      1,
      MAX_PAGES_LIMIT,
    ),
    concurrency: readBoundedInteger(
      options.concurrency ?? DEFAULT_CONCURRENCY,
      'concurrency',
      1,
      MAX_CONCURRENCY_LIMIT,
    ),
    timeoutMs: readBoundedInteger(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'timeoutMs',
      1,
      MAX_TIMEOUT_MS_LIMIT,
    ),
    maxRedirectHops: readBoundedInteger(
      options.maxRedirectHops ?? DEFAULT_MAX_REDIRECT_HOPS,
      'maxRedirectHops',
      0,
      MAX_REDIRECT_HOPS_LIMIT,
    ),
  };
}

function readUserAgent(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || /[\r\n]/u.test(value)) {
    throw new AuditModelError('userAgent must be a single-line non-empty string');
  }
  return value;
}

function readBoundedInteger(value: number, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new AuditModelError(`${label} must be an integer from ${String(min)} to ${String(max)}`);
  }
  return value;
}
