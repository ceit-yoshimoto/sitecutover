import type { Finding } from '../model/finding.js';
import type { JsonObject, JsonValue } from '../model/json.js';
import type { PagePair, PageSnapshot } from '../model/page.js';
import { createFinding } from './create-finding.js';
import type { CheckContext } from './context.js';

export function checkRedirectChain(pair: PagePair, context: CheckContext): Finding[] {
  const target = pair.target;
  if (target === null) {
    return [];
  }

  const findings: Finding[] = [];
  const trace = redirectTrace(target);
  const base = {
    ruleId: 'SC002' as const,
    path: pair.path,
    targetUrl: target.requestedUrl,
    targetValue: traceJson(trace),
    ...(pair.source === null ? {} : { sourceUrl: pair.source.requestedUrl }),
  };

  if (target.redirectLoop) {
    findings.push(
      createFinding({
        ...base,
        severity: 'error',
        message: `Target redirect loop detected: ${formatTrace(trace)}`,
        help: 'Break the loop so the target URL finishes on a real page.',
      }),
    );
  }

  if (target.redirectHopLimitExceeded) {
    findings.push(
      createFinding({
        ...base,
        severity: 'error',
        message: `Target redirect exceeded the hop limit: ${formatTrace(trace)}`,
        help: 'Shorten the redirect chain so it finishes within the hop limit.',
      }),
    );
  }

  if (!target.redirectLoop && !target.redirectHopLimitExceeded && target.redirectHops.length > 1) {
    findings.push(
      createFinding({
        ...base,
        severity: 'warning',
        message: `Target redirect chain is longer than one hop: ${formatTrace(trace)}`,
        help: 'Review the extra hop and remove it when it is not needed.',
      }),
    );
  }

  if (endsOnAnotherOrigin(target, context.targetOrigin)) {
    findings.push(
      createFinding({
        ...base,
        severity: 'warning',
        message: `Target redirect ends on a different origin: ${target.finalUrl}`,
        help: 'Confirm the final URL is an intentional destination for this migration.',
      }),
    );
  }

  return findings;
}

interface RedirectStep {
  url: string;
  status: number | null;
}

function redirectTrace(snapshot: PageSnapshot): RedirectStep[] {
  return [
    ...snapshot.redirectHops.map((hop) => ({ url: hop.url, status: hop.status })),
    { url: snapshot.finalUrl, status: snapshot.status },
  ];
}

function traceJson(trace: readonly RedirectStep[]): JsonValue[] {
  return trace.map((hop): JsonObject => ({
    url: hop.url,
    status: hop.status,
  }));
}

function formatTrace(trace: readonly RedirectStep[]): string {
  return trace
    .map((hop) => `${hop.status === null ? 'failed' : String(hop.status)} ${hop.url}`)
    .join(' -> ');
}

function endsOnAnotherOrigin(snapshot: PageSnapshot, targetOrigin: string): boolean {
  try {
    return new URL(snapshot.finalUrl).origin !== new URL(targetOrigin).origin;
  } catch {
    return false;
  }
}
