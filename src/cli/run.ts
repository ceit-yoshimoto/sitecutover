import { writeFile } from 'node:fs/promises';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { compareSites, type CompareSitesOptions } from '../compare/compare-sites.js';
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_PAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_CONCURRENCY_LIMIT,
  MAX_PAGES_LIMIT,
} from '../crawl/limits.js';
import { MAX_TIMEOUT_MS_LIMIT } from '../http/fetch-page.js';
import { AuditModelError, AuditRuntimeError } from '../model/errors.js';
import {
  FAIL_ON_LEVELS,
  normalizeAuditConfig,
  REPORT_FORMATS,
  type FailOn,
} from '../model/report.js';
import { renderReport } from '../reporters/render.js';
import { renderCompareHelp, renderHelp } from './help.js';
import { VERSION } from './version.js';

export interface CliIo {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

export interface CliDependencies {
  compareSites?: typeof compareSites;
  writeFile?: (path: string, contents: string) => Promise<void>;
}

const compareParseOptions = {
  from: { type: 'string' },
  to: { type: 'string' },
  'max-pages': { type: 'string' },
  concurrency: { type: 'string' },
  timeout: { type: 'string' },
  format: { type: 'string' },
  output: { type: 'string' },
  'fail-on': { type: 'string' },
  'no-sitemap': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const satisfies ParseArgsConfig['options'];

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  dependencies: CliDependencies = {},
): Promise<number> {
  const command = argv[0];
  if (command === 'compare') {
    return runCompare(argv.slice(1), io, dependencies);
  }

  try {
    const parsed = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });

    if (parsed.values.help === true) {
      io.stdout(renderHelp());
      return 0;
    }

    if (parsed.values.version === true) {
      io.stdout(`${VERSION}\n`);
      return 0;
    }

    if (parsed.positionals.length === 0) {
      io.stdout(renderHelp());
      return 0;
    }

    const unknown = parsed.positionals[0] ?? 'unknown';
    io.stderr(`Unknown command "${unknown}".\n`);
    io.stderr('Run sitecutover --help for usage.\n');
    return 2;
  } catch (error) {
    return usageError(io, error, 'sitecutover --help');
  }
}

async function runCompare(
  argv: readonly string[],
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  let values: ReturnType<typeof parseCompareArgs>;
  try {
    values = parseCompareArgs(argv);
  } catch (error) {
    return usageError(io, error, 'sitecutover compare --help');
  }

  if (values.help === true) {
    io.stdout(renderCompareHelp());
    return 0;
  }
  if (values.version === true) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }

  let options: CompareSitesOptions;
  try {
    options = compareOptions(values);
    normalizeAuditConfig({
      sourceRoot: options.sourceRoot,
      targetRoot: options.targetRoot,
      maxPages: options.maxPages,
      concurrency: options.concurrency,
      timeoutMs: options.timeoutMs,
      format: options.format,
      failOn: options.failOn,
      sitemap: options.sitemap,
    });
  } catch (error) {
    return usageError(io, error, 'sitecutover compare --help');
  }

  const compare = dependencies.compareSites ?? compareSites;
  let report;
  try {
    report = await compare(options);
  } catch (error) {
    if (error instanceof AuditRuntimeError || error instanceof AuditModelError) {
      io.stderr(`${error.message}\n`);
    } else {
      io.stderr('The audit could not be completed.\n');
    }
    return 2;
  }

  const rendered = renderReport(report, options.format);
  if (values.output !== undefined) {
    const write = dependencies.writeFile ?? writeFile;
    try {
      await write(values.output, rendered);
    } catch {
      io.stderr(`Could not write the report to ${values.output}.\n`);
      return 2;
    }
  } else {
    io.stdout(rendered);
  }

  return exitCodeFor(report.summary.counts, options.failOn);
}

function parseCompareArgs(argv: readonly string[]): {
  help?: boolean;
  version?: boolean;
  from?: string;
  to?: string;
  maxPages?: string;
  concurrency?: string;
  timeout?: string;
  format?: string;
  output?: string;
  failOn?: string;
  sitemap: boolean;
} {
  const parsed = parseArgs({
    args: [...argv],
    strict: true,
    allowPositionals: false,
    options: compareParseOptions,
  });
  return {
    ...(parsed.values.help === undefined ? {} : { help: parsed.values.help }),
    ...(parsed.values.version === undefined ? {} : { version: parsed.values.version }),
    ...(parsed.values.from === undefined ? {} : { from: parsed.values.from }),
    ...(parsed.values.to === undefined ? {} : { to: parsed.values.to }),
    ...(parsed.values['max-pages'] === undefined ? {} : { maxPages: parsed.values['max-pages'] }),
    ...(parsed.values.concurrency === undefined ? {} : { concurrency: parsed.values.concurrency }),
    ...(parsed.values.timeout === undefined ? {} : { timeout: parsed.values.timeout }),
    ...(parsed.values.format === undefined ? {} : { format: parsed.values.format }),
    ...(parsed.values.output === undefined ? {} : { output: parsed.values.output }),
    ...(parsed.values['fail-on'] === undefined ? {} : { failOn: parsed.values['fail-on'] }),
    sitemap: parsed.values['no-sitemap'] !== true,
  };
}

function compareOptions(values: {
  from?: string;
  to?: string;
  maxPages?: string;
  concurrency?: string;
  timeout?: string;
  format?: string;
  failOn?: string;
  sitemap: boolean;
}): CompareSitesOptions {
  if (values.from === undefined) {
    throw new AuditModelError('Missing required option --from.');
  }
  if (values.to === undefined) {
    throw new AuditModelError('Missing required option --to.');
  }
  return {
    sourceRoot: values.from,
    targetRoot: values.to,
    maxPages: readInteger(values.maxPages, '--max-pages', 1, MAX_PAGES_LIMIT, DEFAULT_MAX_PAGES),
    concurrency: readInteger(
      values.concurrency,
      '--concurrency',
      1,
      MAX_CONCURRENCY_LIMIT,
      DEFAULT_CONCURRENCY,
    ),
    timeoutMs: readInteger(
      values.timeout,
      '--timeout',
      1,
      MAX_TIMEOUT_MS_LIMIT,
      DEFAULT_TIMEOUT_MS,
    ),
    format: readChoice(values.format, '--format', REPORT_FORMATS, 'console'),
    failOn: readChoice(values.failOn, '--fail-on', FAIL_ON_LEVELS, 'error'),
    sitemap: values.sitemap,
    userAgent: `sitecutover/${VERSION}`,
    version: VERSION,
  };
}

function readInteger(
  value: string | undefined,
  label: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!/^\d+$/u.test(value)) {
    throw new AuditModelError(`${label} must be an integer from ${String(min)} to ${String(max)}.`);
  }
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new AuditModelError(`${label} must be an integer from ${String(min)} to ${String(max)}.`);
  }
  return parsed;
}

function readChoice<T extends string>(
  value: string | undefined,
  label: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined) {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new AuditModelError(`${label} must be one of: ${allowed.join(', ')}.`);
}

function exitCodeFor(
  counts: { error: number; warning: number; info: number },
  failOn: FailOn,
): number {
  if (failOn === 'never') {
    return 0;
  }
  if (failOn === 'warning') {
    return counts.error > 0 || counts.warning > 0 ? 1 : 0;
  }
  return counts.error > 0 ? 1 : 0;
}

function usageError(io: CliIo, error: unknown, helpCommand: string): number {
  const message = error instanceof Error ? error.message : 'Invalid arguments.';
  io.stderr(`${message}\n`);
  io.stderr(`Run ${helpCommand} for usage.\n`);
  return 2;
}
