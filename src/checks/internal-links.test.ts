import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { crawlSite } from '../crawl/crawler.js';
import { startLocalServer, type LocalServer } from '../testing/local-http-server.js';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { auditInternalLinks, checkInternalLink } from './internal-links.js';

const userAgent = 'sitecutover-test/9';

function pathnameOf(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function requestKey(request: IncomingMessage): string {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  return `${url.pathname}${url.search}`;
}

function htmlResponse(response: ServerResponse, html: string, status = 200): void {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}

function link(href: string): string {
  return `<a href="${href}">${href}</a>`;
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (server: LocalServer) => Promise<void>,
): Promise<void> {
  const server = await startLocalServer(handler);
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

async function crawled(
  server: LocalServer,
  maxPages: number,
  concurrency = 2,
): Promise<Awaited<ReturnType<typeof crawlSite>>> {
  return crawlSite({
    rootUrl: `${server.origin}/`,
    userAgent,
    concurrency,
    maxPages,
    timeoutMs: 2_000,
  });
}

describe('checkInternalLink', () => {
  it('reports a broken destination and a long redirect together', () => {
    const findings = checkInternalLink({
      url: 'https://new.example.net/old',
      referrers: ['https://new.example.net/b', 'https://new.example.net/a'],
      snapshot: pageSnapshot({
        requestedUrl: 'https://new.example.net/old',
        finalUrl: 'https://new.example.net/new',
        status: 404,
        redirectHops: [
          { url: 'https://new.example.net/old', status: 301 },
          { url: 'https://new.example.net/mid', status: 302 },
        ],
      }),
    });

    expect(findings.map((finding) => finding.severity)).toEqual(['error', 'warning']);
    expect(findings[0]).toMatchObject({
      ruleId: 'SC007',
      path: '/old',
      sourceUrl: 'https://new.example.net/a',
      targetUrl: 'https://new.example.net/old',
      sourceValue: ['https://new.example.net/a', 'https://new.example.net/b'],
      targetValue: { status: 404, finalUrl: 'https://new.example.net/new' },
    });
  });
});

describe('auditInternalLinks', () => {
  it('reports broken statuses once and ignores a healthy page and a single redirect', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const key = requestKey(request);
        hits.set(key, (hits.get(key) ?? 0) + 1);
        const path = pathnameOf(request);
        if (path === '/') {
          htmlResponse(
            response,
            [
              link('/ok'),
              link('/missing'),
              link('/gone'),
              link('/broken'),
              link('/once'),
              link('/multi'),
              link('/a'),
              link('/b'),
            ].join(''),
          );
          return;
        }
        if (path === '/a' || path === '/b') {
          htmlResponse(response, link('/dup'));
          return;
        }
        if (path === '/once') {
          response.writeHead(301, { location: '/once-landed' });
          response.end();
          return;
        }
        if (path === '/multi') {
          response.writeHead(302, { location: '/multi-b' });
          response.end();
          return;
        }
        if (path === '/multi-b') {
          response.writeHead(302, { location: '/multi-c' });
          response.end();
          return;
        }
        const status =
          path === '/missing' || path === '/dup'
            ? 404
            : path === '/gone'
              ? 410
              : path === '/broken'
                ? 500
                : 200;
        htmlResponse(response, '<p>page</p>', status);
      },
      async (server) => {
        const crawl = await crawled(server, 20);
        const findings = await auditInternalLinks(crawl.pages, {
          userAgent,
          timeoutMs: 2_000,
          concurrency: 2,
        });

        expect(findings.filter((finding) => finding.path === '/ok')).toEqual([]);
        expect(findings.filter((finding) => finding.path === '/once')).toEqual([]);
        expect(findings.filter((finding) => finding.path === '/missing')).toMatchObject([
          {
            ruleId: 'SC007',
            severity: 'error',
            message: expect.stringContaining('404') as unknown,
          },
        ]);
        expect(findings.filter((finding) => finding.path === '/gone')[0]?.message).toContain('410');
        expect(findings.filter((finding) => finding.path === '/broken')[0]?.message).toContain(
          '500',
        );
        expect(findings.filter((finding) => finding.path === '/multi')).toMatchObject([
          { severity: 'warning' },
        ]);
        expect(findings.find((finding) => finding.path === '/dup')).toMatchObject({
          severity: 'error',
          sourceValue: [`${server.origin}/a`, `${server.origin}/b`],
        });
        expect(hits.get('/dup')).toBe(1);
        expect(hits.get('/missing')).toBe(1);
        expect(hits.get('/ok')).toBe(1);
      },
    );
  });

  it('keeps query strings distinct and fetches each fragment target once', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const key = requestKey(request);
        hits.set(key, (hits.get(key) ?? 0) + 1);
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/') {
          htmlResponse(
            response,
            [link('/item?id=1'), link('/item?id=2'), link('/dest#a'), link('/dest#b')].join(''),
          );
          return;
        }
        const status = url.pathname === '/item' && url.search === '?id=2' ? 404 : 200;
        htmlResponse(response, '<p>page</p>', status);
      },
      async (server) => {
        const crawl = await crawled(server, 10);
        const findings = await auditInternalLinks(crawl.pages, {
          userAgent,
          timeoutMs: 2_000,
          concurrency: 2,
        });

        expect(findings.map((finding) => finding.path)).toEqual(['/item?id=2']);
        expect(hits.get('/item?id=1')).toBe(1);
        expect(hits.get('/item?id=2')).toBe(1);
        expect(hits.get('/dest')).toBe(1);
      },
    );
  });

  it('does not fetch external links or a cross-origin redirect target', async () => {
    let externalHits = 0;
    const external = await startLocalServer((_request, response) => {
      externalHits += 1;
      htmlResponse(response, link('/secret'));
    });

    try {
      await withServer(
        (request, response) => {
          const path = pathnameOf(request);
          if (path === '/') {
            htmlResponse(response, `${link('/jump')}${link(`${external.origin}/outside`)}`);
            return;
          }
          response.writeHead(302, { location: `${external.origin}/landed` });
          response.end();
        },
        async (server) => {
          const crawl = await crawled(server, 10);
          const findings = await auditInternalLinks(crawl.pages, {
            userAgent,
            timeoutMs: 2_000,
            concurrency: 2,
          });

          expect(externalHits).toBe(0);
          expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
        },
      );
    } finally {
      await external.close();
    }
  });

  it('checks links seen on crawled pages without crawling past the page limit', async () => {
    const hits: string[] = [];
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.push(path);
        if (path === '/') {
          htmlResponse(response, `${link('/a')}${link('/b')}`);
          return;
        }
        if (path === '/a') {
          htmlResponse(response, link('/secret'), 404);
          return;
        }
        htmlResponse(response, '<p>ok</p>');
      },
      async (server) => {
        const crawl = await crawled(server, 1, 1);
        expect(hits).toEqual(['/']);
        const findings = await auditInternalLinks(crawl.pages, {
          userAgent,
          timeoutMs: 2_000,
          concurrency: 2,
        });

        expect(hits.filter((path) => path === '/secret')).toEqual([]);
        expect(findings.map((finding) => finding.path).sort()).toEqual(['/a']);
        expect(findings[0]?.severity).toBe('error');
      },
    );
  });

  it('limits in-flight link checks to the concurrency setting', async () => {
    let current = 0;
    let peak = 0;
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        if (path === '/') {
          const links = Array.from({ length: 6 }, (_value, index) => link(`/p/${String(index)}`));
          htmlResponse(response, links.join(''));
          return;
        }

        current += 1;
        peak = Math.max(peak, current);
        setTimeout(() => {
          current -= 1;
          htmlResponse(response, '<p>ok</p>');
        }, 30);
      },
      async (server) => {
        const crawl = await crawled(server, 1, 1);
        await auditInternalLinks(crawl.pages, {
          userAgent,
          timeoutMs: 2_000,
          concurrency: 2,
        });
        expect(peak).toBe(2);
      },
    );
  });
});
