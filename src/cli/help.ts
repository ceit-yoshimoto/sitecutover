import { VERSION } from './version.js';
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_PAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_CONCURRENCY_LIMIT,
  MAX_PAGES_LIMIT,
} from '../crawl/limits.js';
import { MAX_TIMEOUT_MS_LIMIT } from '../http/fetch-page.js';

export function renderHelp(): string {
  return [
    `sitecutover ${VERSION}`,
    '',
    'Detect website migration and production-cutover regressions.',
    '',
    'Usage:',
    '  sitecutover compare --from <url> --to <url> [options]',
    '  sitecutover --help',
    '  sitecutover --version',
    '',
    'Commands:',
    '  compare    Compare a source site with a target site',
    '',
    'Options:',
    '  -h, --help     Show this help',
    '  -v, --version  Show the version',
    '',
    'Run sitecutover compare --help for compare options.',
    '',
  ].join('\n');
}

export function renderCompareHelp(): string {
  return [
    `sitecutover ${VERSION}`,
    '',
    'Compare a source site with a target site.',
    '',
    'Usage:',
    '  sitecutover compare --from <url> --to <url> [options]',
    '',
    'Options:',
    '  --from <url>            Source origin root (required)',
    '  --to <url>              Target origin root (required)',
    `  --max-pages <number>    Pages to fetch per origin (default ${String(DEFAULT_MAX_PAGES)}, max ${String(MAX_PAGES_LIMIT)})`,
    `  --concurrency <number>  Simultaneous requests (default ${String(DEFAULT_CONCURRENCY)}, max ${String(MAX_CONCURRENCY_LIMIT)})`,
    `  --timeout <ms>          Request timeout (default ${String(DEFAULT_TIMEOUT_MS)}, max ${String(MAX_TIMEOUT_MS_LIMIT)})`,
    '  --format <format>       console, json, or markdown (default console)',
    '  --output <file>         Write the report to a file instead of stdout',
    '  --fail-on <level>       error, warning, or never (default error)',
    '  --no-sitemap            Do not fetch robots.txt or sitemaps',
    '  -h, --help              Show this help',
    '  -v, --version           Show the version',
    '',
    '--from and --to must be origin roots, such as https://example.com/.',
    'Requests run source, then target, then extra link checks, so --concurrency',
    'is the maximum number of simultaneous requests.',
    '',
  ].join('\n');
}
