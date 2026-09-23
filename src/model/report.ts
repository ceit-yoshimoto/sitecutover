import { AuditModelError } from './errors.js';
import { isRuleId, isSeverity, type Finding, type Severity } from './finding.js';
import { serializeJson, toJsonValue, type JsonValue } from './json.js';

export const REPORT_FORMATS = ['console', 'json', 'markdown'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const FAIL_ON_LEVELS = ['error', 'warning', 'never'] as const;

export type FailOn = (typeof FAIL_ON_LEVELS)[number];

/** Normalized compare options. Credential and request-header fields are intentionally absent. */
export interface AuditConfig {
  sourceRoot: string;
  targetRoot: string;
  sourceOrigin: string;
  targetOrigin: string;
  maxPages: number;
  concurrency: number;
  timeoutMs: number;
  format: ReportFormat;
  failOn: FailOn;
  sitemap: boolean;
}

export interface SeverityCounts {
  error: number;
  warning: number;
  info: number;
}

export interface AuditSummary {
  sourceOrigin: string;
  targetOrigin: string;
  pagesExamined: number;
  sourcePages: number;
  targetPages: number;
  counts: SeverityCounts;
}

export interface AuditTiming {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface AuditReport {
  version: string;
  timestamp: string;
  config: AuditConfig;
  summary: AuditSummary;
  findings: readonly Finding[];
  timing: AuditTiming;
}

export interface CreateAuditReportInput {
  version: string;
  config: AuditConfig;
  pagesExamined: number;
  sourcePages: number;
  targetPages: number;
  findings: readonly Finding[];
  startedAt: string;
  finishedAt: string;
}

export function normalizeAuditConfig(input: unknown): AuditConfig {
  const record = asRecord(input, 'Audit config');
  const source = normalizeRoot(readString(record, 'sourceRoot'), 'sourceRoot');
  const target = normalizeRoot(readString(record, 'targetRoot'), 'targetRoot');

  return {
    sourceRoot: source.href,
    targetRoot: target.href,
    sourceOrigin: source.origin,
    targetOrigin: target.origin,
    maxPages: readPositiveInteger(record, 'maxPages'),
    concurrency: readPositiveInteger(record, 'concurrency'),
    timeoutMs: readPositiveInteger(record, 'timeoutMs'),
    format: readEnum(record, 'format', REPORT_FORMATS),
    failOn: readEnum(record, 'failOn', FAIL_ON_LEVELS),
    sitemap: readBoolean(record, 'sitemap'),
  };
}

export function createAuditReport(input: CreateAuditReportInput): AuditReport {
  const version = readRequiredText(input.version, 'version');
  const started = parseTimestamp(input.startedAt, 'startedAt');
  const finished = parseTimestamp(input.finishedAt, 'finishedAt');
  if (finished.getTime() < started.getTime()) {
    throw new AuditModelError('finishedAt must be greater than or equal to startedAt');
  }

  const config = copyConfig(input.config);
  const findings = input.findings.map((finding, index) => copyFinding(finding, index));
  findings.sort(compareFindings);
  const finishedAt = finished.toISOString();

  return {
    version,
    timestamp: finishedAt,
    config,
    summary: {
      sourceOrigin: config.sourceOrigin,
      targetOrigin: config.targetOrigin,
      pagesExamined: readCount(input.pagesExamined, 'pagesExamined'),
      sourcePages: readCount(input.sourcePages, 'sourcePages'),
      targetPages: readCount(input.targetPages, 'targetPages'),
      counts: countFindings(findings),
    },
    findings,
    timing: {
      startedAt: started.toISOString(),
      finishedAt,
      durationMs: finished.getTime() - started.getTime(),
    },
  };
}

export function serializeAuditReport(report: AuditReport): string {
  return serializeJson(report);
}

function copyConfig(config: AuditConfig): AuditConfig {
  return {
    sourceRoot: config.sourceRoot,
    targetRoot: config.targetRoot,
    sourceOrigin: config.sourceOrigin,
    targetOrigin: config.targetOrigin,
    maxPages: config.maxPages,
    concurrency: config.concurrency,
    timeoutMs: config.timeoutMs,
    format: config.format,
    failOn: config.failOn,
    sitemap: config.sitemap,
  };
}

function copyFinding(finding: Finding, index: number): Finding {
  const label = `findings[${String(index)}]`;
  if (typeof finding.ruleId !== 'string' || !isRuleId(finding.ruleId)) {
    throw new AuditModelError(`${label}.ruleId is not a v0.1 rule`);
  }
  if (typeof finding.severity !== 'string' || !isSeverity(finding.severity)) {
    throw new AuditModelError(`${label}.severity is invalid`);
  }

  const copy: Finding = {
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: readRequiredText(finding.message, `${label}.message`),
  };
  assignText(copy, 'path', finding.path, `${label}.path`);
  assignText(copy, 'sourceUrl', finding.sourceUrl, `${label}.sourceUrl`);
  assignText(copy, 'targetUrl', finding.targetUrl, `${label}.targetUrl`);
  assignText(copy, 'help', finding.help, `${label}.help`);
  assignJson(copy, 'sourceValue', finding.sourceValue);
  assignJson(copy, 'targetValue', finding.targetValue);
  return copy;
}

function assignText(
  finding: Finding,
  key: 'path' | 'sourceUrl' | 'targetUrl' | 'help',
  value: string | undefined,
  label: string,
): void {
  if (value === undefined) {
    return;
  }
  finding[key] = readRequiredText(value, label);
}

function assignJson(
  finding: Finding,
  key: 'sourceValue' | 'targetValue',
  value: JsonValue | undefined,
): void {
  if (value === undefined) {
    return;
  }
  finding[key] = toJsonValue(value);
}

function countFindings(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function compareFindings(left: Finding, right: Finding): number {
  const bySeverity = severityRank(left.severity) - severityRank(right.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const byRule = compareStrings(left.ruleId, right.ruleId);
  if (byRule !== 0) {
    return byRule;
  }
  const byPath = compareStrings(left.path ?? '', right.path ?? '');
  if (byPath !== 0) {
    return byPath;
  }
  const bySource = compareStrings(left.sourceUrl ?? '', right.sourceUrl ?? '');
  if (bySource !== 0) {
    return bySource;
  }
  const byTarget = compareStrings(left.targetUrl ?? '', right.targetUrl ?? '');
  if (byTarget !== 0) {
    return byTarget;
  }
  return compareStrings(left.message, right.message);
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case 'error':
      return 0;
    case 'warning':
      return 1;
    case 'info':
      return 2;
    default: {
      const unexpected: never = severity;
      throw new AuditModelError(`Unexpected severity: ${String(unexpected)}`);
    }
  }
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

function normalizeRoot(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuditModelError(`${label} must be an absolute http(s) URL`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AuditModelError(`${label} must use http or https`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new AuditModelError(`${label} must not include credentials`);
  }

  url.hash = '';
  return url;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AuditModelError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AuditModelError(`${key} must be a non-empty string`);
  }
  return value;
}

function readRequiredText(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AuditModelError(`${label} must be a non-empty string`);
  }
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AuditModelError(`${key} must be an integer greater than or equal to 1`);
  }
  return value;
}

function readCount(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new AuditModelError(`${label} must be an integer greater than or equal to 0`);
  }
  return value;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new AuditModelError(`${key} must be a boolean`);
  }
  return value;
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = record[key];
  if (typeof value === 'string' && includesString(allowed, value)) {
    return value;
  }
  throw new AuditModelError(`${key} must be one of: ${allowed.join(', ')}`);
}

function includesString<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value);
}

function parseTimestamp(value: string, label: string): Date {
  if (typeof value !== 'string' || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw new AuditModelError(`${label} must be an ISO-8601 timestamp`);
  }
  return new Date(value);
}
