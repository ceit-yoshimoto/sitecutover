import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { AuditModelError } from '../model/errors.js';
import { startLocalServer, type LocalServer } from '../testing/local-http-server.js';
import { auditSitemapCoverage, type AuditSitemapOptions } from './audit-sitemaps.js';
import { discoverSitemaps } from './discover.js';

const userAgent = 'sitecutover-test/9';
const xmlns = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function pathnameOf(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function xmlResponse(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/xml; charset=utf-8' });
  response.end(body);
}

function textResponse(
  response: ServerResponse,
  body: string,
  status = 200,
  contentType = 'text/plain; charset=utf-8',
): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function urlset(locs: readonly string[]): string {
  const entries = locs
    .map((loc) => `  <url><loc>${loc.replaceAll('&', '&amp;')}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${xmlns}">\n${entries}\n</urlset>\n`;
}

function sitemapIndex(locs: readonly string[]): string {
  const entries = locs.map((loc) => `  <sitemap><loc>${loc}</loc></sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${xmlns}">\n${entries}\n</sitemapindex>\n`;
}

function options(maxSitemaps = 20): AuditSitemapOptions {
  return { userAgent, timeoutMs: 5_000, maxSitemaps };
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

describe('sitemap discovery', () => {
  it('reads a urlset from /sitemap.xml', async () => {
    await withServer(
      (request, response) => {
        expect(request.method).toBe('GET');
        if (pathnameOf(request) === '/sitemap.xml') {
          xmlResponse(response, urlset([`${originFrom(request)}/services/web/`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.failures).toEqual([]);
        expect(discovered.pageUrls).toEqual([`${server.origin}/services/web/`]);
      },
    );
  });

  it('discovers a sitemap from robots.txt Sitemap directives', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.set(path, (hits.get(path) ?? 0) + 1);
        if (path === '/robots.txt') {
          textResponse(response, 'User-agent: *\n  sItEmAp:   /custom.xml\n');
          return;
        }
        if (path === '/custom.xml') {
          xmlResponse(response, urlset([`${originFrom(request)}/from-robots/`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.pageUrls).toEqual([`${server.origin}/from-robots/`]);
        expect(hits.get('/custom.xml')).toBe(1);
        expect(discovered.failures).toEqual([]);
      },
    );
  });

  it('reads /wp-sitemap.xml when the other candidates are missing', async () => {
    await withServer(
      (request, response) => {
        if (pathnameOf(request) === '/wp-sitemap.xml') {
          xmlResponse(response, urlset([`${originFrom(request)}/wp/`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.pageUrls).toEqual([`${server.origin}/wp/`]);
        expect(discovered.failures).toEqual([]);
      },
    );
  });

  it('follows a sitemap index to its child sitemap', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.set(path, (hits.get(path) ?? 0) + 1);
        const origin = originFrom(request);
        if (path === '/sitemap.xml') {
          xmlResponse(response, sitemapIndex([`${origin}/child.xml`, `${origin}/child.xml`]));
          return;
        }
        if (path === '/child.xml') {
          xmlResponse(response, urlset([`${origin}/services/web/`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.pageUrls).toEqual([`${server.origin}/services/web/`]);
        expect(hits.get('/child.xml')).toBe(1);
      },
    );
  });

  it('requests each sitemap URL once when robots repeats it', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.set(path, (hits.get(path) ?? 0) + 1);
        if (path === '/robots.txt') {
          textResponse(response, 'Sitemap: /sitemap.xml\nSitemap: /sitemap.xml\n');
          return;
        }
        if (path === '/sitemap.xml') {
          xmlResponse(response, urlset([`${originFrom(request)}/once/`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.pageUrls).toEqual([`${server.origin}/once/`]);
        expect(hits.get('/sitemap.xml')).toBe(1);
      },
    );
  });

  it('stops a sitemap index cycle without fetching the same URL twice', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.set(path, (hits.get(path) ?? 0) + 1);
        const origin = originFrom(request);
        if (path === '/sitemap.xml') {
          xmlResponse(response, sitemapIndex([`${origin}/child.xml`]));
          return;
        }
        if (path === '/child.xml') {
          xmlResponse(response, sitemapIndex([`${origin}/sitemap.xml`, `${origin}/child.xml`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(hits.get('/sitemap.xml')).toBe(1);
        expect(hits.get('/child.xml')).toBe(1);
        expect(discovered.pageUrls).toEqual([]);
        expect(discovered.requestCount).toBeLessThanOrEqual(20);
      },
    );
  });

  it('warns when a declared sitemap is XML that cannot be parsed', async () => {
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        if (path === '/robots.txt') {
          textResponse(response, 'Sitemap: /bad.xml\n');
          return;
        }
        if (path === '/bad.xml') {
          xmlResponse(response, '<<<');
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.failures).toEqual([
          { url: `${server.origin}/bad.xml`, reason: 'malformed' },
        ]);
      },
    );
  });

  it('does not warn when candidate sitemap URLs are missing', async () => {
    await withServer(
      (_request, response) => {
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options());
        expect(discovered.failures).toEqual([]);
        expect(discovered.pageUrls).toEqual([]);
        expect(discovered.uncheckedUrls).toEqual([]);
      },
    );
  });

  it('does not request a sitemap on another origin', async () => {
    const externalHits = new Map<string, number>();
    const external = await startLocalServer((request, response) => {
      externalHits.set(pathnameOf(request), (externalHits.get(pathnameOf(request)) ?? 0) + 1);
      xmlResponse(response, urlset(['https://example.com/secret/']));
    });
    try {
      await withServer(
        (request, response) => {
          if (pathnameOf(request) === '/robots.txt') {
            textResponse(response, `Sitemap: ${external.origin}/secret.xml\n`);
            return;
          }
          if (pathnameOf(request) === '/sitemap.xml') {
            xmlResponse(response, sitemapIndex([`${external.origin}/from-index.xml`]));
            return;
          }
          textResponse(response, 'missing', 404);
        },
        async (server) => {
          const discovered = await discoverSitemaps(server.origin, options());
          expect(externalHits.size).toBe(0);
          expect(discovered.failures.map((failure) => failure.reason)).toEqual([
            'cross-origin',
            'cross-origin',
          ]);
          expect(discovered.pageUrls).toEqual([]);
        },
      );
    } finally {
      await external.close();
    }
  });

  it('does not follow a sitemap redirect onto another origin', async () => {
    const externalHits = { count: 0 };
    const external = await startLocalServer((request, response) => {
      externalHits.count += 1;
      expect(request.method).toBe('GET');
      xmlResponse(response, urlset(['https://example.com/secret/']));
    });
    try {
      await withServer(
        (request, response) => {
          if (pathnameOf(request) === '/sitemap.xml') {
            response.writeHead(302, { location: `${external.origin}/secret.xml` });
            response.end();
            return;
          }
          textResponse(response, 'missing', 404);
        },
        async (server) => {
          const discovered = await discoverSitemaps(server.origin, options());
          expect(externalHits.count).toBe(0);
          expect(discovered.failures).toMatchObject([
            {
              url: `${server.origin}/sitemap.xml`,
              reason: 'cross-origin-redirect',
              finalUrl: `${external.origin}/secret.xml`,
            },
          ]);
        },
      );
    } finally {
      await external.close();
    }
  });

  it('stops after the sitemap request budget and does not fetch the rest', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.set(path, (hits.get(path) ?? 0) + 1);
        const origin = originFrom(request);
        if (path === '/robots.txt') {
          textResponse(response, 'Sitemap: /sitemap.xml\n');
          return;
        }
        if (path === '/sitemap.xml') {
          xmlResponse(
            response,
            sitemapIndex([`${origin}/c1.xml`, `${origin}/c2.xml`, `${origin}/c3.xml`]),
          );
          return;
        }
        if (path === '/c1.xml' || path === '/c2.xml' || path === '/c3.xml') {
          xmlResponse(response, urlset([`${origin}${path}`]));
          return;
        }
        textResponse(response, 'missing', 404);
      },
      async (server) => {
        const discovered = await discoverSitemaps(server.origin, options(1));
        expect(discovered.requestCount).toBe(1);
        expect(hits.get('/c1.xml') ?? 0).toBe(0);
        expect(hits.get('/c2.xml') ?? 0).toBe(0);
        expect(hits.get('/c3.xml') ?? 0).toBe(0);
        expect(discovered.uncheckedUrls).toEqual([
          `${server.origin}/sitemap_index.xml`,
          `${server.origin}/wp-sitemap.xml`,
          `${server.origin}/c1.xml`,
          `${server.origin}/c2.xml`,
          `${server.origin}/c3.xml`,
        ]);
      },
    );
  });
});

describe('auditSitemapCoverage', () => {
  it('warns only for source sitemap URLs missing from the target', async () => {
    await withServer(
      (request, response) => {
        if (pathnameOf(request) !== '/sitemap.xml') {
          textResponse(response, 'missing', 404);
          return;
        }
        const origin = originFrom(request);
        xmlResponse(
          response,
          urlset([
            `${origin}/services/web/`,
            `${origin}/only-source/?q=1`,
            `${origin}/frag#section`,
          ]),
        );
      },
      async (source) => {
        await withServer(
          (request, response) => {
            if (pathnameOf(request) !== '/sitemap.xml') {
              textResponse(response, 'missing', 404);
              return;
            }
            const origin = originFrom(request);
            xmlResponse(response, urlset([`${origin}/services/web/`, `${origin}/frag`]));
          },
          async (target) => {
            const findings = await auditSitemapCoverage(source.origin, target.origin, options());
            expect(findings).toMatchObject([
              {
                ruleId: 'SC008',
                severity: 'warning',
                path: '/only-source/?q=1',
                sourceUrl: `${source.origin}/only-source/?q=1`,
                targetUrl: `${target.origin}/only-source/?q=1`,
              },
            ]);
          },
        );
      },
    );
  });

  it('rejects a sitemap budget outside the safe range', async () => {
    await expect(discoverSitemaps('https://example.com', options(201))).rejects.toBeInstanceOf(
      AuditModelError,
    );
  });
});

function originFrom(request: IncomingMessage): string {
  const host = request.headers.host;
  if (host === undefined) {
    throw new Error('fixture request is missing a host');
  }
  return `http://${host}`;
}
