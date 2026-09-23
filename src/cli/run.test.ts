import { mkdtemp, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from './version.js';
import { startLocalServer, type LocalServer } from '../testing/local-http-server.js';
import { runCli } from './run.js';

function pathnameOf(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
}

function page(origin: string, path: string, links: readonly string[] = []): string {
  const anchors = links.map((href) => `<a href="${href}">${href}</a>`).join('');
  return `<!doctype html><html><head><title>Page</title><meta name="description" content="Same"><link rel="canonical" href="${origin}${path}"></head><body>${anchors}</body></html>`;
}

function send(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
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

async function capture(
  argv: readonly string[],
  dependencies?: Parameters<typeof runCli>[2],
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(
    argv,
    {
      stdout: (chunk) => {
        stdout += chunk;
      },
      stderr: (chunk) => {
        stderr += chunk;
      },
    },
    dependencies,
  );
  return { code, stdout, stderr };
}

describe('runCli', () => {
  it('prints help and version without auditing', async () => {
    for (const argv of [['--help'], ['-h'], []] as const) {
      const result = await capture(argv);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`sitecutover ${VERSION}`);
      expect(result.stdout).toContain('sitecutover compare --from <url> --to <url>');
    }

    for (const argv of [['--version'], ['-v'], ['compare', '--version']] as const) {
      const result = await capture(argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(`${VERSION}\n`);
    }

    const compareHelp = await capture(['compare', '--help']);
    expect(compareHelp.code).toBe(0);
    expect(compareHelp.stdout).toContain('--from <url>');
    expect(compareHelp.stdout).toContain('--max-pages <number>');
    expect(compareHelp.stdout).toContain('default 250');
    expect(compareHelp.stdout).toContain('--concurrency <number>');
    expect(compareHelp.stdout).toContain('default 5');
    expect(compareHelp.stdout).toContain('--timeout <ms>');
    expect(compareHelp.stdout).toContain('default 15000');
    expect(compareHelp.stdout).toContain('--format <format>');
    expect(compareHelp.stdout).toContain('--fail-on <level>');
    expect(compareHelp.stdout).toContain('--no-sitemap');
    expect(compareHelp.stdout).toContain('--output <file>');
  });

  it('rejects unknown commands and invalid compare options before any audit', async () => {
    let calls = 0;
    const dependencies = {
      compareSites: (): Promise<never> => {
        calls += 1;
        return Promise.reject(new Error('should not audit'));
      },
    };
    const unknown = await capture(['audit']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('Unknown command');

    const badOption = await capture(['--format', 'json']);
    expect(badOption.code).toBe(2);

    for (const argv of [
      ['compare'],
      ['compare', '--from', 'https://old.example.com/blog/', '--to', 'https://new.example.com/'],
      [
        'compare',
        '--from',
        'https://old.example.com/',
        '--to',
        'https://new.example.com/',
        '--format',
        'xml',
      ],
      [
        'compare',
        '--from',
        'https://old.example.com/',
        '--to',
        'https://new.example.com/',
        '--max-pages',
        '0',
      ],
      [
        'compare',
        '--from',
        'https://old.example.com/',
        '--to',
        'https://new.example.com/',
        '--concurrency',
        'nope',
      ],
      [
        'compare',
        '--from',
        'https://old.example.com/',
        '--to',
        'https://new.example.com/',
        '--fail-on',
        'info',
      ],
    ]) {
      const result = await capture(argv, dependencies);
      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain('should not audit');
    }
    expect(calls).toBe(0);
  });

  it('renders console, json, and markdown, and writes --output only to the file', async () => {
    const userAgents = new Set<string>();
    await withServer(
      (request, response) => {
        userAgents.add(String(request.headers['user-agent']));
        const origin = originOf(request);
        const path = pathnameOf(request);
        if (path === '/robots.txt' || path.endsWith('.xml')) {
          send(response, 'missing', 404);
          return;
        }
        send(response, page(origin, path, path === '/' ? ['/gone/'] : []));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            userAgents.add(String(request.headers['user-agent']));
            const path = pathnameOf(request);
            if (path === '/gone/') {
              send(response, 'missing', 404);
              return;
            }
            if (path === '/robots.txt' || path.endsWith('.xml')) {
              send(response, 'missing', 404);
              return;
            }
            send(response, page(originOf(request), path));
          },
          async (target) => {
            const args = [
              'compare',
              '--from',
              `${source.origin}/`,
              '--to',
              `${target.origin}/`,
              '--no-sitemap',
            ];
            const consoleReport = await capture(args);
            expect(consoleReport.code).toBe(1);
            expect(consoleReport.stdout).toContain('ERROR SC001 /gone/');
            expect(consoleReport.stderr).toBe('');

            const jsonReport = await capture([...args, '--format', 'json', '--fail-on', 'never']);
            expect(jsonReport.code).toBe(0);
            const parsed = JSON.parse(jsonReport.stdout) as { summary: { pagesExamined: number } };
            expect(parsed.summary.pagesExamined).toBeGreaterThan(0);
            expect(jsonReport.stdout.endsWith('\n')).toBe(true);

            const markdown = await capture([...args, '--format', 'markdown', '--fail-on', 'never']);
            expect(markdown.code).toBe(0);
            expect(markdown.stdout).toContain('# sitecutover report');
            expect(markdown.stdout).toContain('### SC001');

            const directory = await mkdtemp(join(tmpdir(), 'sitecutover-'));
            try {
              const output = join(directory, 'report.json');
              const written = await capture([
                ...args,
                '--format',
                'json',
                '--output',
                output,
                '--fail-on',
                'never',
              ]);
              expect(written.code).toBe(0);
              expect(written.stdout).toBe('');
              const { readFile } = await import('node:fs/promises');
              const file = await readFile(output, 'utf8');
              expect(file).toContain('"ruleId": "SC001"');
            } finally {
              await rm(directory, { recursive: true, force: true });
            }

            const failed = await capture(
              [...args, '--output', join(tmpdir(), 'missing-dir', 'report.txt')],
              {
                writeFile: () => Promise.reject(new Error('EACCES')),
              },
            );
            expect(failed.code).toBe(2);
            expect(failed.stdout).toBe('');
            expect(failed.stderr).toContain('Could not write the report');
            expect(failed.stderr).not.toContain('SC001');
            expect(userAgents).toEqual(new Set([`sitecutover/${VERSION}`]));
          },
        );
      },
    );
  });

  it('uses fail-on thresholds and reports target failures without exiting 2', async () => {
    await withServer(
      (request, response) => {
        const origin = originOf(request);
        const path = pathnameOf(request);
        send(response, page(origin, path, path === '/' ? ['/warn/'] : []));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originOf(request);
            const path = pathnameOf(request);
            if (path === '/warn/') {
              send(
                response,
                `<!doctype html><html><head><title>Page</title><link rel="canonical" href="${origin}/warn/"></head><body></body></html>`,
              );
              return;
            }
            send(response, page(origin, path));
          },
          async (target) => {
            const args = [
              'compare',
              '--from',
              `${source.origin}/`,
              '--to',
              `${target.origin}/`,
              '--no-sitemap',
            ];
            const errorsOnly = await capture([...args, '--fail-on', 'error']);
            expect(errorsOnly.code).toBe(0);
            expect(errorsOnly.stdout).toContain('SC006');

            const warningsToo = await capture([...args, '--fail-on', 'warning']);
            expect(warningsToo.code).toBe(1);

            const ignored = await capture([...args, '--fail-on', 'never']);
            expect(ignored.code).toBe(0);
          },
        );
      },
    );
  });

  it('keeps an info-only difference below the warning threshold', async () => {
    await withServer(
      (request, response) => {
        const origin = originOf(request);
        send(response, titled(origin, pathnameOf(request), 'Source title'));
      },
      async (source) => {
        await withServer(
          (request, response) => {
            const origin = originOf(request);
            send(response, titled(origin, pathnameOf(request), 'Target title'));
          },
          async (target) => {
            const args = [
              'compare',
              '--from',
              `${source.origin}/`,
              '--to',
              `${target.origin}/`,
              '--no-sitemap',
            ];
            const warning = await capture([...args, '--fail-on', 'warning']);
            expect(warning.code).toBe(0);
            expect(warning.stdout).toContain('INFO SC005');
            const error = await capture([...args, '--fail-on', 'error']);
            expect(error.code).toBe(0);
          },
        );
      },
    );
  });

  it('reports a target connection failure as a finding', async () => {
    const closed = await startLocalServer((_request, response) => {
      response.end('closed');
    });
    const targetOrigin = closed.origin;
    await closed.close();
    await withServer(
      (request, response) => {
        send(response, page(originOf(request), pathnameOf(request)));
      },
      async (source) => {
        const result = await capture([
          'compare',
          '--from',
          `${source.origin}/`,
          '--to',
          `${targetOrigin}/`,
          '--no-sitemap',
        ]);
        expect(result.code).toBe(1);
        expect(result.stdout).toContain('SC001');
        expect(result.stdout).toContain('Target request failed');
        expect(result.stderr).toBe('');
      },
    );
  });

  it('exits 2 when the source baseline cannot be fetched', async () => {
    const closed = await startLocalServer((_request, response) => {
      response.end('closed');
    });
    const sourceOrigin = closed.origin;
    await closed.close();
    await withServer(
      (_request, response) => {
        send(response, page('http://127.0.0.1', '/'));
      },
      async (target) => {
        const result = await capture([
          'compare',
          '--from',
          `${sourceOrigin}/`,
          '--to',
          `${target.origin}/`,
          '--no-sitemap',
        ]);
        expect(result.code).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Source baseline could not be fetched');
        expect(result.stderr).not.toContain('<!doctype');
      },
    );
  });
});

function titled(origin: string, path: string, title: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="Same"><link rel="canonical" href="${origin}${path}"></head><body></body></html>`;
}

function originOf(request: IncomingMessage): string {
  const host = request.headers.host;
  if (host === undefined) {
    throw new Error('fixture request is missing a host');
  }
  return `http://${host}`;
}
