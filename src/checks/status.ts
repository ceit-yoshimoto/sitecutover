import { mapUrl } from '../compare/pair-pages.js';
import type { Finding } from '../model/finding.js';
import type { PagePair, PageSnapshot } from '../model/page.js';
import { createFinding } from './create-finding.js';
import type { CheckContext } from './context.js';
import {
  isKnownMissingSource,
  isSourceComparisonBaseline,
  sourceBaselineFailure,
} from './source-baseline.js';

export function checkTargetStatus(pair: PagePair, context: CheckContext): Finding[] {
  const source = pair.source;
  if (source === null) {
    return [];
  }
  if (!isSourceComparisonBaseline(source)) {
    if (isKnownMissingSource(source)) {
      return [];
    }
    const reason = sourceBaselineFailure(source) ?? 'no HTTP status';
    return [
      createFinding({
        ruleId: 'SC001',
        severity: 'warning',
        path: pair.path,
        sourceUrl: source.requestedUrl,
        sourceValue: reason,
        message: `Source page could not be used as a comparison baseline (${reason}).`,
        help: 'Retry this source URL before treating the target as a migration regression.',
      }),
    ];
  }

  const sourceUrl = source.requestedUrl;
  const targetUrl =
    pair.target?.requestedUrl ?? mapUrl(source.requestedUrl, context.targetOrigin) ?? undefined;
  const shared = {
    ruleId: 'SC001' as const,
    path: pair.path,
    sourceUrl,
    sourceValue: source.status,
    ...(targetUrl === undefined ? {} : { targetUrl }),
  };

  if (pair.target === null) {
    return [
      createFinding({
        ...shared,
        severity: 'error',
        message: `Target page is missing; source returned ${formatStatus(source.status)}`,
        help: 'Restore the target URL or add a redirect before launch.',
      }),
    ];
  }

  if (pair.target.fetchError !== null) {
    return [
      createFinding({
        ...shared,
        severity: 'error',
        message: `Target request failed (${pair.target.fetchError.code}); source returned ${formatStatus(source.status)}`,
        targetValue: pair.target.fetchError.code,
        help: 'Retry the target URL and fix the network or timeout failure before launch.',
      }),
    ];
  }

  if (isRedirectDiagnostic(pair.target)) {
    return [];
  }

  if (!isSuccessStatus(pair.target.status)) {
    return [
      createFinding({
        ...shared,
        severity: 'error',
        message: `Target returned ${formatStatus(pair.target.status)}; source returned ${formatStatus(source.status)}`,
        targetValue: pair.target.status,
        help: 'Restore the target page or replace it with a working redirect.',
      }),
    ];
  }

  return [];
}

function isRedirectDiagnostic(snapshot: PageSnapshot): boolean {
  return (
    snapshot.redirectLoop ||
    snapshot.redirectHopLimitExceeded ||
    snapshot.crossOriginRedirectStopped
  );
}

function isSuccessStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}

function formatStatus(status: number | null): string {
  return status === null ? 'no status' : String(status);
}
