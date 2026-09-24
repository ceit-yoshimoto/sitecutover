import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { startLocalServer, type LocalServer } from '../testing/local-http-server.js';
import { compareSites, type CompareSitesOptions } from './compare-sites.js';

const userAgent = 'sitecutover-test/9';

function pathnameOf(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function document(input: {
  origin: string;
  path: string;
  title?: string;
  description?: string | null;
  canonical?: string | null;
  robots?: string | null;
  links?: readonly string[];
}): string {
  const title = input.title ?? `Page ${input.path}`;
  const description =
    input.description === null
      ? ''
      : `<meta name="description" content="${input.description ?? `Description ${input.path}`}">`;
  const canonical =
    input.canonical === null
      ? ''
      : `<link rel="canonical" href="${input.canonical ?? `${input.origin}${input.path}`}">`;
  const robots =
    input.robots === undefined || input.robots === null
      ? ''
      : `<meta name="robots" content="${input.robots}">`;
  const anchors = (input.links ?? []).map((href) => `<a href="${href}">${href}</a>`).join('');
  return `<!doctype html><html><head><title>${title}</title>${description}${canonical}${robots}</head><body>${anchors}</body></html>`;
}

function send(
  response: ServerResponse,
  body: string,
  status = 200,
  contentType = 'text/html; charset=utf-8',
): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function urlset(locs: readonly string[]): string {
  const entries = locs.map((loc) => `<url><loc>${loc}</loc></url>`).join('');
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
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

function options(
  source: string,
  target: string,
  overrides: Partial<CompareSitesOptions> = {},
): CompareSitesOptions {
  return {
    sourceRoot: `${source}/`,
    targetRoot: `${target}/`,
    maxPages: 20,
    concurrency: 2,
    timeoutMs: 2_000,
    format: 'json',
    failOn: 'error',
    sitemap: true,
    userAgent,
    version: '0.0.0',
    now: sequentialClock(),
    ...overrides,
  };
}

function sequentialClock(): () => Date {
  const times = [Date.parse('2026-09-23T00:00:00.000Z'), Date.parse('2026-09-23T00:00:03.000Z')];
  let index = 0;
  return () => new Date(times[Math.min(index++, times.length - 1)] ?? times[0] ?? 0);
}

function originFrom(request: IncomingMessage): string {
  const host = request.headers.host;
  if (host === undefined) {
    throw new Error('fixture request is missing a host');
  }
  return `http://${host}`;
}

describe('compareSites', () => {
  it('does not report SC001 when source and target both return 200', async () => {
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        if (path === '/robots.txt' || path.endsWith('.xml')) {
          send(response, 'missing', 404, 'text/plain');
          return;
        }
        send(response, document({ origin: originFrom(request), path }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const path = pathnameOf(request);
            if (path === '/robots.txt' || path.endsWith('.xml')) {
              send(response, 'missing', 404, 'text/plain');
              return;
            }
            send(response, document({ origin: originFrom(request), path }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false }),
            );
            expect(report.findings.filter((finding) => finding.ruleId === 'SC001')).toEqual([]);
            expect(report.summary.pagesExamined).toBe(1);
            expect(report.summary.sourcePages).toBe(1);
            expect(report.summary.targetPages).toBe(1);
            expect(report.version).toBe('0.0.0');
            expect(report.timestamp).toBe('2026-09-23T00:00:03.000Z');
            expect(report.timing).toMatchObject({
              startedAt: '2026-09-23T00:00:00.000Z',
              finishedAt: '2026-09-23T00:00:03.000Z',
              durationMs: 3_000,
            });
          },
        );
      },
    );
  });

  it('checks a mapped target URL that the target home page does not link', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        if (path === '/') {
          send(response, document({ origin, path, links: ['/linked/'] }));
          return;
        }
        send(response, document({ origin, path }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originFrom(request);
            const path = pathnameOf(request);
            hits.set(path, (hits.get(path) ?? 0) + 1);
            if (path === '/') {
              send(response, document({ origin, path, links: ['/extra/'] }));
              return;
            }
            if (path === '/extra/') {
              send(response, document({ origin, path, robots: 'noindex' }));
              return;
            }
            send(response, document({ origin, path }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false }),
            );
            expect(hits.get('/linked/')).toBe(1);
            expect(report.findings.some((finding) => finding.path === '/linked/')).toBe(false);
            expect(report.findings.some((finding) => finding.path === '/extra/')).toBe(false);
            expect(report.summary.pagesExamined).toBe(2);
            expect(report.summary.targetPages).toBe(3);
          },
        );
      },
    );
  });

  it('reports a mapped 404 and metadata, link, and sitemap regressions', async () => {
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        if (path === '/robots.txt') {
          send(response, 'Sitemap: /sitemap.xml\n', 200, 'text/plain');
          return;
        }
        if (path === '/sitemap.xml') {
          send(
            response,
            urlset([`${origin}/services/`, `${origin}/only-source/`]),
            200,
            'application/xml',
          );
          return;
        }
        if (path === '/') {
          send(response, document({ origin, path, links: ['/services/', '/gone/'] }));
          return;
        }
        if (path === '/services/') {
          send(
            response,
            document({
              origin,
              path,
              title: 'Services',
              description: 'Web work',
              links: ['/broken/'],
            }),
          );
          return;
        }
        send(response, document({ origin, path }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originFrom(request);
            const path = pathnameOf(request);
            if (path === '/robots.txt') {
              send(response, 'Sitemap: /sitemap.xml\n', 200, 'text/plain');
              return;
            }
            if (path === '/sitemap.xml') {
              send(response, urlset([`${origin}/services/`]), 200, 'application/xml');
              return;
            }
            if (path === '/gone/') {
              send(response, 'missing', 404);
              return;
            }
            if (path === '/broken/') {
              send(response, 'missing', 404);
              return;
            }
            if (path === '/') {
              send(response, document({ origin, path, links: ['/services/'] }));
              return;
            }
            if (path === '/services/') {
              send(
                response,
                document({
                  origin,
                  path,
                  title: 'New services',
                  description: null,
                  canonical: `${origin}/other/`,
                  robots: 'noindex',
                  links: ['/broken/'],
                }),
              );
              return;
            }
            send(response, document({ origin, path }));
          },
          async (target) => {
            const report = await compareSites(options(source.origin, target.origin));
            const rules = report.findings.map(
              (finding) => `${finding.ruleId} ${finding.path ?? ''}`,
            );
            expect(rules).toContain('SC001 /gone/');
            expect(rules).toContain('SC003 /services/');
            expect(rules).toContain('SC004 /services/');
            expect(rules).toContain('SC005 /services/');
            expect(rules).toContain('SC006 /services/');
            expect(rules).toContain('SC007 /broken/');
            expect(report.findings).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ ruleId: 'SC008', path: '/only-source/' }),
              ]),
            );
            expect(
              report.findings.some(
                (finding) => finding.path === '/only-source/' && finding.ruleId === 'SC001',
              ),
            ).toBe(false);
          },
        );
      },
    );
  });

  it('does not request robots.txt or sitemaps when sitemap audit is disabled', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const path = pathnameOf(request);
        hits.set(`source ${path}`, (hits.get(`source ${path}`) ?? 0) + 1);
        send(response, document({ origin: originFrom(request), path }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const path = pathnameOf(request);
            hits.set(`target ${path}`, (hits.get(`target ${path}`) ?? 0) + 1);
            send(response, document({ origin: originFrom(request), path }));
          },
          async (target) => {
            await compareSites(options(source.origin, target.origin, { sitemap: false }));
            expect(hits.get('source /robots.txt') ?? 0).toBe(0);
            expect(hits.get('source /sitemap.xml') ?? 0).toBe(0);
            expect(hits.get('target /robots.txt') ?? 0).toBe(0);
            expect(hits.get('target /sitemap.xml') ?? 0).toBe(0);
          },
        );
      },
    );
  });

  it('fetches a target URL once when it is both linked and mapped from the source', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        send(response, document({ origin, path, links: path === '/' ? ['/shared/'] : [] }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originFrom(request);
            const path = pathnameOf(request);
            hits.set(path, (hits.get(path) ?? 0) + 1);
            send(response, document({ origin, path, links: path === '/' ? ['/shared/'] : [] }));
          },
          async (target) => {
            await compareSites(options(source.origin, target.origin, { sitemap: false }));
            expect(hits.get('/shared/')).toBe(1);
          },
        );
      },
    );
  });

  it('stops each crawl at max-pages', async () => {
    const hits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        hits.set(`source ${path}`, (hits.get(`source ${path}`) ?? 0) + 1);
        send(
          response,
          document({ origin, path, links: path === '/' ? ['/a/', '/b/', '/c/'] : [] }),
        );
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const path = pathnameOf(request);
            hits.set(`target ${path}`, (hits.get(`target ${path}`) ?? 0) + 1);
            send(response, document({ origin: originFrom(request), path }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false, maxPages: 2 }),
            );
            expect(hits.get('source /c/') ?? 0).toBe(0);
            expect(hits.get('target /c/') ?? 0).toBe(0);
            expect(report.summary.sourcePages).toBe(2);
            expect(report.summary.targetPages).toBe(2);
          },
        );
      },
    );
  });

  it('keeps simultaneous requests within the concurrency limit', async () => {
    let current = 0;
    let peak = 0;
    const track = async (response: ServerResponse, body: string): Promise<void> => {
      current += 1;
      peak = Math.max(peak, current);
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
      current -= 1;
      send(response, body);
    };
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        void track(
          response,
          document({ origin, path, links: path === '/' ? ['/a/', '/b/', '/c/'] : [] }),
        );
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originFrom(request);
            const path = pathnameOf(request);
            void track(
              response,
              document({ origin, path, links: path === '/' ? ['/a/', '/b/'] : [] }),
            );
          },
          async (target) => {
            await compareSites(
              options(source.origin, target.origin, {
                sitemap: false,
                concurrency: 2,
                maxPages: 10,
              }),
            );
            expect(peak).toBeLessThanOrEqual(2);
            expect(peak).toBeGreaterThan(1);
          },
        );
      },
    );
  });

  it('records a target timeout as a finding', async () => {
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        send(response, document({ origin, path, links: path === '/' ? ['/slow/'] : [] }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            if (pathnameOf(request) === '/slow/') {
              return;
            }
            send(response, document({ origin: originFrom(request), path: pathnameOf(request) }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false, timeoutMs: 200 }),
            );
            expect(report.findings).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  ruleId: 'SC001',
                  path: '/slow/',
                  targetValue: 'TIMEOUT',
                }),
              ]),
            );
          },
        );
      },
    );
  });

  it('fails when the source baseline cannot be fetched and does not request the target', async () => {
    const closed = await startLocalServer((_request, response) => {
      send(response, 'closed');
    });
    const sourceOrigin = closed.origin;
    await closed.close();
    let targetHits = 0;
    await withServer(
      (_request, response) => {
        targetHits += 1;
        send(response, document({ origin: 'http://127.0.0.1', path: '/' }));
      },
      async (target) => {
        await expect(
          compareSites(options(sourceOrigin, target.origin, { sitemap: false })),
        ).rejects.toThrow(/Source baseline could not be fetched \(ECONNREFUSED\)/);
        expect(targetHits).toBe(0);
      },
    );
  });

  it('starts the audit when the source root returns 200', async () => {
    let targetHits = 0;
    await withServer(
      (request, response) => {
        send(response, document({ origin: originFrom(request), path: pathnameOf(request) }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            targetHits += 1;
            send(response, document({ origin: originFrom(request), path: pathnameOf(request) }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false }),
            );
            expect(targetHits).toBeGreaterThan(0);
            expect(report.summary.pagesExamined).toBe(1);
            expect(report.findings.filter((finding) => finding.ruleId === 'SC001')).toEqual([]);
          },
        );
      },
    );
  });

  it('rejects a non-2xx or failed source root before requesting the target', async () => {
    await expectSourceRootRejected((response) => {
      send(response, 'missing', 404);
    }, 'Source baseline returned HTTP 404.');
    await expectSourceRootRejected((response) => {
      send(response, 'down', 500);
    }, 'Source baseline returned HTTP 500.');
    await expectSourceRootRejected(
      () => {
        return;
      },
      'Source baseline could not be fetched (TIMEOUT).',
      200,
    );
    await expectSourceRootRejected((response, request) => {
      response.writeHead(302, { location: `${originFrom(request)}/` });
      response.end();
    }, 'Source baseline stopped on a redirect loop.');
  });

  it('rejects a cross-origin source redirect without requesting the destination or the target', async () => {
    let destinationHits = 0;
    await withServer(
      (_request, response) => {
        destinationHits += 1;
        send(response, 'elsewhere');
      },
      async (elsewhere) => {
        await expectSourceRootRejected((response) => {
          response.writeHead(302, { location: `${elsewhere.origin}/landed/` });
          response.end();
        }, 'Source baseline stopped at a cross-origin redirect.');
        expect(destinationHits).toBe(0);
      },
    );
  });

  it('keeps unusable source children visible and compares the remaining 2xx pages', async () => {
    const targetHits = new Map<string, number>();
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        if (path === '/') {
          send(
            response,
            document({
              origin,
              path,
              links: [
                '/live/',
                '/absent/',
                '/missing/',
                '/gone/',
                '/down/',
                '/slow/',
                '/drop/',
                '/loop/',
              ],
            }),
          );
          return;
        }
        if (path === '/missing/') {
          send(response, 'missing', 404);
          return;
        }
        if (path === '/gone/') {
          send(response, 'gone', 410);
          return;
        }
        if (path === '/down/') {
          send(response, 'down', 500, 'text/plain');
          return;
        }
        if (path === '/slow/') {
          return;
        }
        if (path === '/drop/') {
          request.socket.destroy();
          return;
        }
        if (path === '/loop/') {
          response.writeHead(302, { location: `${origin}/loop/` });
          response.end();
          return;
        }
        send(response, document({ origin, path }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const path = pathnameOf(request);
            targetHits.set(path, (targetHits.get(path) ?? 0) + 1);
            if (path === '/absent/') {
              send(response, 'missing', 404);
              return;
            }
            send(response, document({ origin: originFrom(request), path }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false, timeoutMs: 200 }),
            );
            expect(report.summary.pagesExamined).toBe(3);
            expect(report.summary.sourcePages).toBe(9);
            expect(targetHits.get('/missing/') ?? 0).toBe(0);
            expect(targetHits.get('/gone/') ?? 0).toBe(0);
            expect(targetHits.get('/down/') ?? 0).toBe(0);
            expect(targetHits.get('/slow/') ?? 0).toBe(0);
            expect(targetHits.get('/drop/') ?? 0).toBe(0);
            expect(targetHits.get('/loop/') ?? 0).toBe(0);
            expect(targetHits.get('/live/')).toBe(1);
            expect(report.findings.filter((finding) => finding.path === '/missing/')).toEqual([]);
            expect(report.findings.filter((finding) => finding.path === '/gone/')).toEqual([]);
            expect(report.findings).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  ruleId: 'SC001',
                  severity: 'warning',
                  path: '/down/',
                  message: 'Source page could not be used as a comparison baseline (HTTP 500).',
                }),
                expect.objectContaining({
                  ruleId: 'SC001',
                  severity: 'warning',
                  path: '/slow/',
                  sourceValue: 'TIMEOUT',
                }),
                expect.objectContaining({
                  ruleId: 'SC001',
                  severity: 'warning',
                  path: '/drop/',
                  message: expect.stringContaining(
                    'Source page could not be used as a comparison baseline',
                  ) as unknown,
                }),
                expect.objectContaining({
                  ruleId: 'SC001',
                  severity: 'warning',
                  path: '/loop/',
                  sourceValue: 'redirect loop',
                }),
                expect.objectContaining({
                  ruleId: 'SC001',
                  severity: 'error',
                  path: '/absent/',
                  targetValue: 404,
                }),
              ]),
            );
          },
        );
      },
    );
  });

  it('reports only SC001 when the target error document has metadata and a self link', async () => {
    await withServer(
      (request, response) => {
        const origin = originFrom(request);
        const path = pathnameOf(request);
        send(response, document({ origin, path, links: path === '/' ? ['/old-page/'] : [] }));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originFrom(request);
            const path = pathnameOf(request);
            if (path === '/old-page/') {
              send(
                response,
                `<!doctype html><html><head><title>Not Found</title><meta name="description" content="Missing page"><meta name="robots" content="noindex"><link rel="canonical" href="${origin}/old-page/"></head><body><a href="/old-page/">self</a></body></html>`,
                404,
              );
              return;
            }
            send(response, document({ origin, path }));
          },
          async (target) => {
            const report = await compareSites(
              options(source.origin, target.origin, { sitemap: false }),
            );
            const forPage = report.findings.filter((finding) => finding.path === '/old-page/');
            expect(forPage.map((finding) => `${finding.ruleId}:${finding.severity}`)).toEqual([
              'SC001:error',
            ]);
          },
        );
      },
    );
  });
});

async function expectSourceRootRejected(
  respond: (response: ServerResponse, request: IncomingMessage) => void,
  message: string,
  timeoutMs = 2_000,
): Promise<void> {
  let targetHits = 0;
  await withServer(
    (request, response) => {
      respond(response, request);
    },
    async (source) => {
      await withServer(
        (_request, response) => {
          targetHits += 1;
          send(response, document({ origin: originFrom(_request), path: '/' }));
        },
        async (target) => {
          await expect(
            compareSites(options(source.origin, target.origin, { sitemap: false, timeoutMs })),
          ).rejects.toThrow(message);
          expect(targetHits).toBe(0);
        },
      );
    },
  );
}
