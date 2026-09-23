import type { JsonValue } from './json.js';

export const SEVERITIES = ['error', 'warning', 'info'] as const;

export type Severity = (typeof SEVERITIES)[number];

export const RULE_IDS = [
  'SC001',
  'SC002',
  'SC003',
  'SC004',
  'SC005',
  'SC006',
  'SC007',
  'SC008',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export const RULE_NAMES = {
  SC001: 'target-status',
  SC002: 'redirect-chain',
  SC003: 'canonical',
  SC004: 'indexing-directives',
  SC005: 'title',
  SC006: 'meta-description',
  SC007: 'internal-link-status',
  SC008: 'sitemap-coverage',
} as const satisfies Record<RuleId, string>;

const RULE_ID_SET: ReadonlySet<string> = new Set(RULE_IDS);
const SEVERITY_SET: ReadonlySet<string> = new Set(SEVERITIES);

export function isRuleId(value: string): value is RuleId {
  return RULE_ID_SET.has(value);
}

export function isSeverity(value: string): value is Severity {
  return SEVERITY_SET.has(value);
}

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  message: string;
  path?: string;
  sourceUrl?: string;
  targetUrl?: string;
  sourceValue?: JsonValue;
  targetValue?: JsonValue;
  help?: string;
}
