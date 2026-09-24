import { normalizeHttpUrl } from '../crawl/normalize-url.js';
import { pathKeyForUrl } from '../compare/pair-pages.js';
import type { Finding } from '../model/finding.js';
import type { PagePair } from '../model/page.js';
import { createFinding } from './create-finding.js';
import type { CheckContext } from './context.js';
import { isUsableTargetHtml } from './html.js';

export function checkCanonical(pair: PagePair, context: CheckContext): Finding[] {
  const target = pair.target;
  if (target === null || !isUsableTargetHtml(target)) {
    return [];
  }

  const sourceCanonical = pair.source?.canonical ?? null;
  const targetCanonical = target.canonical;
  const base = {
    ruleId: 'SC003' as const,
    path: pair.path,
    targetUrl: target.requestedUrl,
    ...(pair.source === null ? {} : { sourceUrl: pair.source.requestedUrl }),
    ...(sourceCanonical === null ? {} : { sourceValue: sourceCanonical }),
    ...(targetCanonical === null ? {} : { targetValue: targetCanonical }),
  };

  if (targetCanonical === null) {
    if (sourceCanonical !== null && sourceCanonical.length > 0) {
      return [
        createFinding({
          ...base,
          severity: 'warning',
          message: `Canonical is missing on the target; source canonical is ${sourceCanonical}`,
          help: 'Add a canonical on the target when the source page had one.',
        }),
      ];
    }
    return [];
  }

  const normalizedTarget = normalizeHttpUrl(targetCanonical);
  if (normalizedTarget === null) {
    return [
      createFinding({
        ...base,
        severity: 'warning',
        message: `Canonical URL is malformed: ${targetCanonical}`,
        help: 'Replace the target canonical with an absolute http(s) URL.',
      }),
    ];
  }

  if (sameHost(normalizedTarget, context.sourceOrigin)) {
    return [
      createFinding({
        ...base,
        severity: 'error',
        targetValue: normalizedTarget,
        message: `Canonical points at the source host: ${normalizedTarget}`,
        help: 'Point the target canonical at the new host.',
      }),
    ];
  }

  if (sourceCanonical !== null) {
    const sourcePath = pathKeyForUrl(sourceCanonical);
    const targetPath = pathKeyForUrl(normalizedTarget);
    if (
      sourcePath !== null &&
      targetPath !== null &&
      pathnameOf(sourcePath) !== pathnameOf(targetPath)
    ) {
      return [
        createFinding({
          ...base,
          severity: 'warning',
          targetValue: normalizedTarget,
          message: `Canonical path differs: source ${sourcePath}, target ${targetPath}`,
          help: 'Confirm the target canonical path is the intended replacement.',
        }),
      ];
    }
  }

  return [];
}

function sameHost(url: string, origin: string): boolean {
  try {
    return new URL(url).host === new URL(origin).host;
  } catch {
    return false;
  }
}

function pathnameOf(pathKey: string): string {
  const query = pathKey.indexOf('?');
  return query === -1 ? pathKey : pathKey.slice(0, query);
}
