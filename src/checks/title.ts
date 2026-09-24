import type { Finding } from '../model/finding.js';
import type { PagePair } from '../model/page.js';
import { createFinding } from './create-finding.js';
import { isUsableTargetHtml } from './html.js';

export function checkTitle(pair: PagePair): Finding[] {
  const target = pair.target;
  if (target === null || !isUsableTargetHtml(target)) {
    return [];
  }

  const sourceTitle = pair.source?.title ?? null;
  const targetTitle = target.title;
  const base = {
    ruleId: 'SC005' as const,
    path: pair.path,
    targetUrl: target.requestedUrl,
    sourceValue: sourceTitle,
    targetValue: targetTitle,
    ...(pair.source === null ? {} : { sourceUrl: pair.source.requestedUrl }),
  };

  if (targetTitle === '') {
    return [
      createFinding({
        ...base,
        severity: 'warning',
        message: `Target title is empty; source title is ${formatText(sourceTitle)}`,
        help: 'Give the target page a non-empty title.',
      }),
    ];
  }

  if (targetTitle === null && sourceTitle !== null && sourceTitle.length > 0) {
    return [
      createFinding({
        ...base,
        severity: 'warning',
        message: `Target title is missing; source title is ${formatText(sourceTitle)}`,
        help: 'Restore the target title from the source page.',
      }),
    ];
  }

  if (sourceTitle !== null && targetTitle !== null && sourceTitle !== targetTitle) {
    return [
      createFinding({
        ...base,
        severity: 'info',
        message: `Title changed from ${formatText(sourceTitle)} to ${formatText(targetTitle)}`,
      }),
    ];
  }

  return [];
}

function formatText(value: string | null): string {
  return value === null || value.length === 0 ? '(empty)' : JSON.stringify(value);
}
