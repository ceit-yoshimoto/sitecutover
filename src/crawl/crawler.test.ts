import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { startLocalServer, type LocalServer } from '../testing/local-http-server.js';
import { crawlSite } from './crawler.js';

const userAgent = 'sitecutover-test/9';

function pathnameOf(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function htmlResponse(response: ServerResponse, html: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
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

describe('crawlSite', () => {
  it('crawls same-origin links in breadth-first order', async () => {
    const paths: string[] = [];
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        paths.push(path);
        if (path === '/') {
          htmlResponse(response, '<a href="/b">b</a><a href="/a">a</a>');
          return;
        }
        if (path === '/b') {
          htmlResponse(response, '<a href="/c">c</a>');
          return;
        }
        htmlResponse(response, '<p>leaf</p>');
      },
      async (server) => {
        const result = await crawlSite({
          rootUrl: `${server.origin}/`,
          userAgent,
          concurrency: 1,
          maxPages: 10,
          timeoutMs: 2_000,
        });

        expect(result.origin).toBe(server.origin);
        expect(result.pages.map((page) => page.snapshot.requestedUrl)).toEqual([
          `${server.origin}/`,
          `${server.origin}/b`,
          `${server.origin}/a`,
          `${server.origin}/c`,
        ]);
        expect(result.pages[0]?.snapshot.internalLinks).toEqual([
          `${server.origin}/b`,
          `${server.origin}/a`,
        ]);
        expect(paths).toEqual(['/', '/b', '/a', '/c']);
      },
    );
  });

  it('dedupes fragments and repeated slashes without merging trailing slashes', async () => {
    const paths: string[] = [];
    await withServer(
      (request, response) => {
        paths.push(pathnameOf(request));
        htmlResponse(
          response,
          '<a href="/docs#one">one</a><a href="/docs#two">two</a><a href="/a//b">slash</a><a href="/a/b">same</a><a href="/docs/">slash-doc</a>',
        );
      },
      async (server) => {
        const result = await crawlSite({
          rootUrl: `${server.origin}/#top`,
          userAgent,
          concurrency: 2,
          maxPages: 10,
          timeoutMs: 2_000,
        });

        expect(
          result.pages.map((page) => new URL(page.snapshot.requestedUrl).pathname).sort(),
        ).toEqual(['/', '/a/b', '/docs', '/docs/'].sort());
        expect(paths.filter((path) => path === '/docs')).toHaveLength(1);
        expect(paths).not.toContain('/a//b');
      },
    );
  });

  it('records external links and does not fetch them', async () => {
    let externalHits = 0;
    const external = await startLocalServer((request, response) => {
      externalHits += 1;
      htmlResponse(response, `<a href="${pathnameOf(request)}-secret">secret</a>`);
    });

    try {
      await withServer(
        (_request, response) => {
          htmlResponse(
            response,
            `<a href="${external.origin}/outside">out</a><a href="/inside">in</a>`,
          );
        },
        async (server) => {
          const result = await crawlSite({
            rootUrl: `${server.origin}/`,
            userAgent,
            concurrency: 2,
            maxPages: 10,
            timeoutMs: 2_000,
          });

          expect(externalHits).toBe(0);
          expect(result.pages[0]?.externalLinks).toEqual([`${external.origin}/outside`]);
          expect(
            result.pages.map((page) => new URL(page.snapshot.requestedUrl).pathname).sort(),
          ).toEqual(['/', '/inside'].sort());
        },
      );
    } finally {
      await external.close();
    }
  });

  it('does not harvest links from a redirect that leaves the origin', async () => {
    let externalHits = 0;
    const external = await startLocalServer((_request, response) => {
      externalHits += 1;
      htmlResponse(response, '<a href="/secret">secret</a>');
    });

    try {
      await withServer(
        (_request, response) => {
          response.writeHead(302, { location: `${external.origin}/landed` });
          response.end();
        },
        async (server) => {
          const result = await crawlSite({
            rootUrl: `${server.origin}/start`,
            userAgent,
            concurrency: 2,
            maxPages: 10,
            timeoutMs: 2_000,
          });

          expect(externalHits).toBe(1);
          expect(result.pages).toHaveLength(1);
          expect(result.pages[0]?.snapshot.finalUrl).toBe(`${external.origin}/landed`);
          expect(result.pages[0]?.snapshot.internalLinks).toEqual([]);
        },
      );
    } finally {
      await external.close();
    }
  });

  it('stops at the page limit', async () => {
    const paths: string[] = [];
    await withServer(
      (request, response) => {
        paths.push(pathnameOf(request));
        htmlResponse(response, '<a href="/b">b</a><a href="/a">a</a>');
      },
      async (server) => {
        const result = await crawlSite({
          rootUrl: `${server.origin}/`,
          userAgent,
          concurrency: 1,
          maxPages: 2,
          timeoutMs: 2_000,
        });

        expect(result.pages.map((page) => new URL(page.snapshot.requestedUrl).pathname)).toEqual([
          '/',
          '/b',
        ]);
        expect(paths).toEqual(['/', '/b']);
        expect(result.pages[0]?.snapshot.internalLinks).toEqual([
          `${server.origin}/b`,
          `${server.origin}/a`,
        ]);
      },
    );
  });

  it('limits in-flight requests to the concurrency setting', async () => {
    let current = 0;
    let peak = 0;
    const waiters: Array<() => void> = [];

    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        if (path === '/') {
          const links = Array.from(
            { length: 6 },
            (_value, index) => `<a href="/p/${String(index)}">p</a>`,
          );
          htmlResponse(response, links.join(''));
          return;
        }

        current += 1;
        peak = Math.max(peak, current);
        void new Promise<void>((resolve) => {
          waiters.push(resolve);
          if (waiters.length === 3) {
            const ready = waiters.splice(0, waiters.length);
            for (const release of ready) {
              release();
            }
          }
        }).then(() => {
          current -= 1;
          htmlResponse(response, '<p>ok</p>');
        });
      },
      async (server) => {
        const result = await crawlSite({
          rootUrl: `${server.origin}/`,
          userAgent,
          concurrency: 3,
          maxPages: 20,
          timeoutMs: 2_000,
        });

        expect(peak).toBe(3);
        expect(result.pages).toHaveLength(7);
      },
    );
  });

  it('returns a fetch error for a non-http root without throwing', async () => {
    const result = await crawlSite({
      rootUrl: 'mailto:person@example.com',
      userAgent,
      timeoutMs: 2_000,
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.snapshot.fetchError?.code).toBe('UNSUPPORTED_PROTOCOL');
  });

  it('stores parsed metadata and the X-Robots-Tag header on the snapshot', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'x-robots-tag': 'NOINDEX, NoFollow',
        });
        response.end(`
          <title>Company</title>
          <meta name="description" content="About us">
          <meta name="robots" content="noindex">
          <link rel="canonical" href="/company/">
          <a href="/team">Team</a>
        `);
      },
      async (server) => {
        const result = await crawlSite({
          rootUrl: `${server.origin}/start`,
          userAgent,
          concurrency: 1,
          maxPages: 1,
          timeoutMs: 2_000,
        });
        const page = result.pages[0]?.snapshot;

        expect(page?.title).toBe('Company');
        expect(page?.metaDescription).toBe('About us');
        expect(page?.metaRobots).toBe('noindex');
        expect(page?.xRobotsTag).toBe('noindex, nofollow');
        expect(page?.canonical).toBe(`${server.origin}/company/`);
        expect(page?.internalLinks).toEqual([`${server.origin}/team`]);
      },
    );
  });
});
