import type { Finding } from '../model/finding.js';
import type { PagePair } from '../model/page.js';
import { createFinding } from './create-finding.js';
import { isUsableTargetHtml } from './html.js';

export function checkDescription(pair: PagePair): Finding[] {
  const target = pair.target;
  if (target === null || !isUsableTargetHtml(target)) {
    return [];
  }

  const sourceDescription = pair.source?.metaDescription ?? null;
  const targetDescription = target.metaDescription;
  const base = {
    ruleId: 'SC006' as const,
    path: pair.path,
    targetUrl: target.requestedUrl,
    sourceValue: sourceDescription,
    targetValue: targetDescription,
    ...(pair.source === null ? {} : { sourceUrl: pair.source.requestedUrl }),
  };

  if (
    sourceDescription !== null &&
    sourceDescription.length > 0 &&
    (targetDescription === null || targetDescription.length === 0)
  ) {
    return [
      createFinding({
        ...base,
        severity: 'warning',
        message: `Target meta description is missing; source description is ${formatText(sourceDescription)}`,
        help: 'Restore the target meta description from the source page.',
      }),
    ];
  }

  if (
    sourceDescription !== null &&
    targetDescription !== null &&
    sourceDescription.length > 0 &&
    targetDescription.length > 0 &&
    sourceDescription !== targetDescription
  ) {
    return [
      createFinding({
        ...base,
        severity: 'info',
        message: `Meta description changed from ${formatText(sourceDescription)} to ${formatText(targetDescription)}`,
      }),
    ];
  }

  return [];
}

function formatText(value: string | null): string {
  return value === null || value.length === 0 ? '(empty)' : JSON.stringify(value);
}
