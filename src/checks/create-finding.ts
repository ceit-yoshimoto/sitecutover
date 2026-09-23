import type { Finding, RuleId, Severity } from '../model/finding.js';
import type { JsonValue } from '../model/json.js';

export function createFinding(input: {
  ruleId: RuleId;
  severity: Severity;
  message: string;
  path: string;
  sourceUrl?: string;
  targetUrl?: string;
  sourceValue?: JsonValue;
  targetValue?: JsonValue;
  help?: string;
}): Finding {
  const finding: Finding = {
    ruleId: input.ruleId,
    severity: input.severity,
    message: input.message,
    path: input.path,
  };
  if (input.sourceUrl !== undefined) {
    finding.sourceUrl = input.sourceUrl;
  }
  if (input.targetUrl !== undefined) {
    finding.targetUrl = input.targetUrl;
  }
  if (input.sourceValue !== undefined) {
    finding.sourceValue = input.sourceValue;
  }
  if (input.targetValue !== undefined) {
    finding.targetValue = input.targetValue;
  }
  if (input.help !== undefined) {
    finding.help = input.help;
  }
  return finding;
}
