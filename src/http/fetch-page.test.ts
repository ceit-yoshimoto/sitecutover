import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serializeJson } from '../model/json.js';
import { AuditModelError } from '../model/errors.js';
import { startLocalServer, type LocalServer } from '../testing/local-http-server.js';
import { createUserAgent } from './user-agent.js';
import { fetchPage, toPageSnapshot, type FetchPageOptions } from './fetch-page.js';

const requests: { method: string; path: string; userAgent: string }[] = [];

function options(overrides: Partial<FetchPageOptions> = {}): FetchPageOptions {
  return {
    timeoutMs: 2_000,
    maxRedirectHops: 10,
    userAgent: 'sitecutover-test/9',
    ...overrides,
  };
}

function pathnameOf(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function handle(request: IncomingMessage, response: ServerResponse): void {
  const path = pathnameOf(request);
  requests.push({
    method: request.method ?? '',
    path,
    userAgent: request.headers['user-agent'] ?? '',
  });

  if (path === '/html') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      'set-cookie': 'session=secret-cookie',
    });
    response.end('<!doctype html><p>BODY_MARKER</p>');
    return;
  }

  if (path === '/unavailable') {
    response.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<p>unavailable</p>');
    return;
  }

  if (path === '/image') {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return;
  }

  if (path === '/start') {
    response.writeHead(301, { location: '/landed' });
    response.end();
    return;
  }

  if (path === '/landed') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'all',
    });
    response.end('<p>landed</p>');
    return;
  }

  if (path === '/chain/a' || path === '/chain/b') {
    const next = path === '/chain/a' ? '/chain/b' : '/chain/c';
    response.writeHead(302, { location: next, 'x-robots-tag': 'from-redirect' });
    response.end();
    return;
  }

  if (path === '/chain/c') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'all',
    });
    response.end('<p>final</p>');
    return;
  }

  if (path === '/loop/a') {
    response.writeHead(302, { location: '/loop/b' });
    response.end();
    return;
  }

  if (path === '/loop/b') {
    response.writeHead(302, { location: '/loop/a' });
    response.end();
    return;
  }

  if (path === '/missing-location') {
    response.writeHead(302);
    response.end();
    return;
  }

  if (path === '/big') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('x'.repeat(100));
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('missing');
}

describe('fetchPage', () => {
  let server: LocalServer;

  beforeAll(async () => {
    server = await startLocalServer(handle);
  });

  afterAll(async () => {
    await server.close();
  });

  it('reads HTML, the final x-robots-tag, and a custom user agent', async () => {
    const fetched = await fetchPage(`${server.origin}/html`, options());
    const snapshot = serializeJson(toPageSnapshot(fetched));

    expect(fetched.status).toBe(200);
    expect(fetched.body).toContain('BODY_MARKER');
    expect(fetched.xRobotsTag).toBe('noindex');
    expect(fetched.contentType).toBe('text/html; charset=utf-8');
    expect(fetched.fetchError).toBeNull();
    expect(requests.at(-1)).toMatchObject({ method: 'GET', userAgent: 'sitecutover-test/9' });
    expect(snapshot).not.toContain('BODY_MARKER');
    expect(snapshot).not.toContain('secret-cookie');
    expect(JSON.stringify(fetched)).not.toContain('secret-cookie');
  });

  it('sends the default sitecutover user agent', async () => {
    await fetchPage(`${server.origin}/html`, options({ userAgent: createUserAgent() }));
    expect(requests.at(-1)?.userAgent).toBe(createUserAgent());
  });

  it('keeps an HTTP error status without failing the fetch', async () => {
    const fetched = await fetchPage(`${server.origin}/unavailable`, options());
    expect(fetched.status).toBe(503);
    expect(fetched.fetchError).toBeNull();
    expect(fetched.body).toContain('unavailable');
  });

  it('does not keep a non-HTML body', async () => {
    const fetched = await fetchPage(`${server.origin}/image`, options());
    expect(fetched.status).toBe(200);
    expect(fetched.body).toBeNull();
    expect(fetched.fetchError).toBeNull();
  });

  it('records a relative redirect and the final response headers', async () => {
    const fetched = await fetchPage(`${server.origin}/start`, options());
    expect(fetched.status).toBe(200);
    expect(fetched.finalUrl).toBe(`${server.origin}/landed`);
    expect(fetched.redirectHops).toEqual([{ url: `${server.origin}/start`, status: 301 }]);
    expect(fetched.xRobotsTag).toBe('all');
    expect(fetched.redirectLoop).toBe(false);
    expect(fetched.redirectHopLimitExceeded).toBe(false);
  });

  it('keeps a multi-hop trace and the final page header', async () => {
    const fetched = await fetchPage(`${server.origin}/chain/a`, options());
    expect(fetched.redirectHops).toEqual([
      { url: `${server.origin}/chain/a`, status: 302 },
      { url: `${server.origin}/chain/b`, status: 302 },
    ]);
    expect(fetched.finalUrl).toBe(`${server.origin}/chain/c`);
    expect(fetched.status).toBe(200);
    expect(fetched.xRobotsTag).toBe('all');
    expect(fetched.body).toContain('final');
  });

  it('stops on a redirect loop', async () => {
    const fetched = await fetchPage(`${server.origin}/loop/a`, options());
    expect(fetched.redirectLoop).toBe(true);
    expect(fetched.fetchError).toBeNull();
    expect(fetched.status).toBe(302);
    expect(fetched.redirectHops).toEqual([
      { url: `${server.origin}/loop/a`, status: 302 },
      { url: `${server.origin}/loop/b`, status: 302 },
    ]);
    expect(fetched.finalUrl).toBe(`${server.origin}/loop/b`);
  });

  it('stops when the redirect hop limit is exceeded', async () => {
    let hits = 0;
    const redirectServer = await startLocalServer((request, response) => {
      hits += 1;
      const path = pathnameOf(request);
      const current = Number(path.slice('/hop/'.length));
      response.writeHead(302, { location: `/hop/${String(current + 1)}` });
      response.end();
    });

    try {
      const fetched = await fetchPage(
        `${redirectServer.origin}/hop/0`,
        options({ maxRedirectHops: 1 }),
      );
      expect(fetched.redirectHopLimitExceeded).toBe(true);
      expect(fetched.fetchError).toBeNull();
      expect(hits).toBe(2);
      expect(fetched.redirectHops).toEqual([
        { url: `${redirectServer.origin}/hop/0`, status: 302 },
        { url: `${redirectServer.origin}/hop/1`, status: 302 },
      ]);
      expect(fetched.finalUrl).toBe(`${redirectServer.origin}/hop/1`);
    } finally {
      await redirectServer.close();
    }
  });

  it('follows a redirect onto another local origin', async () => {
    const target = await startLocalServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<p>other-origin</p>');
    });
    const source = await startLocalServer((_request, response) => {
      response.writeHead(302, { location: `${target.origin}/there` });
      response.end();
    });

    try {
      const fetched = await fetchPage(`${source.origin}/from`, options());
      expect(fetched.status).toBe(200);
      expect(fetched.finalUrl).toBe(`${target.origin}/there`);
      expect(fetched.body).toContain('other-origin');
      expect(fetched.redirectHops).toEqual([{ url: `${source.origin}/from`, status: 302 }]);
    } finally {
      await source.close();
      await target.close();
    }
  });

  it('reports a missing Location header', async () => {
    const fetched = await fetchPage(`${server.origin}/missing-location`, options());
    expect(fetched.fetchError?.code).toBe('REDIRECT_MISSING_LOCATION');
    expect(fetched.redirectHops).toEqual([
      { url: `${server.origin}/missing-location`, status: 302 },
    ]);
  });

  it('drops an oversized HTML body', async () => {
    const fetched = await fetchPage(`${server.origin}/big`, options({ maxBodyBytes: 32 }));
    expect(fetched.status).toBe(200);
    expect(fetched.body).toBeNull();
    expect(fetched.fetchError).toEqual({
      code: 'BODY_TOO_LARGE',
      message: 'The response body exceeded the size limit',
    });
  });

  it('does not request a URL that contains credentials', async () => {
    const before = requests.length;
    const credentialUrl = new URL('/html', server.origin);
    credentialUrl.username = 'user';
    credentialUrl.password = 'secret-password';

    const fetched = await fetchPage(credentialUrl.href, options());

    expect(requests).toHaveLength(before);
    expect(fetched.fetchError?.code).toBe('CREDENTIALS_IN_URL');
    expect(JSON.stringify(fetched)).not.toContain('secret-password');
  });

  it('times out without throwing', async () => {
    const hanging = await startLocalServer(() => {
      // Leave the socket open so the client timeout fires.
    });

    try {
      const fetched = await fetchPage(`${hanging.origin}/hang`, options({ timeoutMs: 200 }));
      expect(fetched.status).toBeNull();
      expect(fetched.fetchError).toEqual({
        code: 'TIMEOUT',
        message: 'The request timed out',
      });
    } finally {
      await hanging.close();
    }
  });

  it('represents a refused connection without throwing', async () => {
    const closed = await startLocalServer((_request, response) => {
      response.end('closed');
    });
    const origin = closed.origin;
    await closed.close();

    await expect(fetchPage(`${origin}/html`, options())).resolves.toMatchObject({
      status: null,
      fetchError: { code: 'ECONNREFUSED', message: 'The request failed' },
    });
  });

  it('hides thrown request details and does not follow a credential redirect', async () => {
    const calls: string[] = [];
    const fetched = await fetchPage(
      'http://127.0.0.1:9/start',
      options({
        fetchImpl: (url) => {
          calls.push(url);
          if (calls.length === 1) {
            return Promise.resolve(
              new Response(null, {
                status: 302,
                headers: { location: 'http://user:secret-password@127.0.0.1/next' },
              }),
            );
          }
          return Promise.reject(new Error('Authorization: Bearer secret-token'));
        },
      }),
    );

    expect(calls).toEqual(['http://127.0.0.1:9/start']);
    expect(fetched.fetchError?.code).toBe('CREDENTIALS_IN_URL');
    expect(JSON.stringify(fetched)).not.toContain('secret-password');

    const failed = await fetchPage(
      'http://127.0.0.1:9/boom',
      options({
        fetchImpl: () => Promise.reject(new Error('Authorization: Bearer secret-token')),
      }),
    );
    expect(failed.fetchError).toEqual({ code: 'NETWORK', message: 'The request failed' });
    expect(JSON.stringify(failed)).not.toContain('secret-token');
  });

  it('rejects an invalid user agent before connecting', async () => {
    await expect(
      fetchPage(`${server.origin}/html`, options({ userAgent: 'bad\r\nX-Evil: 1' })),
    ).rejects.toThrow(AuditModelError);
    expect(requests.some((request) => request.userAgent.includes('X-Evil'))).toBe(false);
  });
});
