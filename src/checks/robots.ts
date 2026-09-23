import type { Finding } from '../model/finding.js';
import type { JsonValue } from '../model/json.js';
import type { PagePair, PageSnapshot } from '../model/page.js';
import { createFinding } from './create-finding.js';
import { isHtmlDocument } from './html.js';

export function checkIndexingDirectives(pair: PagePair): Finding[] {
  const target = pair.target;
  if (target === null) {
    return [];
  }

  const source = pair.source;
  const sourceTokens = directiveTokens(source);
  const targetTokens = directiveTokens(target);
  const findings: Finding[] = [];
  const base = {
    ruleId: 'SC004' as const,
    path: pair.path,
    targetUrl: target.requestedUrl,
    sourceValue: directiveRecord(source),
    targetValue: directiveRecord(target),
    ...(source === null ? {} : { sourceUrl: source.requestedUrl }),
  };

  if (!hasNoindex(sourceTokens) && hasNoindex(targetTokens)) {
    findings.push(
      createFinding({
        ...base,
        severity: 'error',
        message: 'Target contains noindex but the source was indexable',
        help: 'Remove noindex from the target meta robots tag and X-Robots-Tag before launch.',
      }),
    );
  }

  if (otherDirectivesDiffer(sourceTokens, targetTokens)) {
    findings.push(
      createFinding({
        ...base,
        severity: 'warning',
        message: 'Indexing directives differ',
        help: 'Compare meta robots and X-Robots-Tag on the source and target pages.',
      }),
    );
  }

  return findings;
}

function directiveTokens(snapshot: PageSnapshot | null): string[] {
  if (snapshot === null) {
    return [];
  }
  const header = tokens(snapshot.xRobotsTag);
  const meta = isHtmlDocument(snapshot) ? tokens(snapshot.metaRobots) : [];
  return [...new Set([...header, ...meta])];
}

function tokens(value: string | null): string[] {
  if (value === null || value.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(',')) {
    const token = part.trim().toLowerCase();
    if (token.length === 0 || seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }
  return result;
}

function hasNoindex(directives: readonly string[]): boolean {
  return directives.includes('noindex') || directives.includes('none');
}

function otherDirectivesDiffer(
  sourceTokens: readonly string[],
  targetTokens: readonly string[],
): boolean {
  const ignore = new Set(['index', 'noindex', 'none']);
  return (
    join(sourceTokens.filter((token) => !ignore.has(token))) !==
    join(targetTokens.filter((token) => !ignore.has(token)))
  );
}

function join(tokensToJoin: readonly string[]): string {
  return [...tokensToJoin].sort(compareStrings).join(',');
}

function directiveRecord(snapshot: PageSnapshot | null): JsonValue {
  return {
    metaRobots: snapshot?.metaRobots ?? null,
    xRobotsTag: snapshot?.xRobotsTag ?? null,
  };
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
