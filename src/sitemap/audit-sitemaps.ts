import type { Finding } from '../model/finding.js';
import type { JsonObject } from '../model/json.js';
import { createFinding } from '../checks/create-finding.js';
import { compareSitemapCoverage } from './coverage.js';
import {
  discoverSitemaps,
  type DiscoverSitemapOptions,
  type SitemapDiscovery,
  type SitemapFailure,
} from './discover.js';

export type AuditSitemapOptions = DiscoverSitemapOptions;

export async function auditSitemapCoverage(
  sourceOrigin: string,
  targetOrigin: string,
  options: AuditSitemapOptions,
): Promise<Finding[]> {
  const source = await discoverSitemaps(sourceOrigin, options);
  const target = await discoverSitemaps(targetOrigin, options);
  return [
    ...discoveryFindings('source', source),
    ...discoveryFindings('target', target),
    ...compareSitemapCoverage({
      sourceOrigin,
      targetOrigin,
      sourceUrls: source.pageUrls,
      targetUrls: target.pageUrls,
    }),
  ];
}

function discoveryFindings(side: 'source' | 'target', discovery: SitemapDiscovery): Finding[] {
  const findings = discovery.failures.map((failure) => failureFinding(side, failure));
  if (discovery.uncheckedUrls.length > 0) {
    findings.push(budgetFinding(side, discovery.fetchBudget, discovery.uncheckedUrls));
  }
  return findings;
}

function failureFinding(side: 'source' | 'target', failure: SitemapFailure): Finding {
  const label = side === 'source' ? 'Source' : 'Target';
  const urlField = side === 'source' ? { sourceUrl: failure.url } : { targetUrl: failure.url };
  if (failure.reason === 'malformed') {
    return createFinding({
      ruleId: 'SC008',
      severity: 'warning',
      message: `${label} sitemap XML could not be parsed: ${failure.url}`,
      ...urlField,
      help: 'Publish a urlset or sitemapindex document at this URL.',
    });
  }
  if (failure.reason === 'cross-origin' || failure.reason === 'cross-origin-redirect') {
    const detail =
      failure.reason === 'cross-origin-redirect' && failure.finalUrl !== undefined
        ? `${failure.url} redirected to ${failure.finalUrl}`
        : failure.url;
    const followed = failure.reason === 'cross-origin-redirect' ? 'redirected to' : 'is on';
    return createFinding({
      ruleId: 'SC008',
      severity: 'warning',
      message: `${label} sitemap ${followed} another origin and was not requested: ${detail}`,
      ...urlField,
      help: 'v0.1 does not request sitemap URLs on another origin.',
    });
  }
  const status = failure.status === undefined ? '' : ` (HTTP ${String(failure.status)})`;
  return createFinding({
    ruleId: 'SC008',
    severity: 'warning',
    message: `${label} sitemap could not be read${status}: ${failure.url}`,
    ...urlField,
    help: 'Confirm this sitemap URL returns XML.',
  });
}

function budgetFinding(
  side: 'source' | 'target',
  fetchBudget: number,
  uncheckedUrls: readonly string[],
): Finding {
  const label = side === 'source' ? 'Source' : 'Target';
  const targetValue: JsonObject = {
    fetchBudget,
    uncheckedCount: uncheckedUrls.length,
    uncheckedUrls: [...uncheckedUrls],
  };
  return createFinding({
    ruleId: 'SC008',
    severity: 'warning',
    message: `${label} sitemap fetch limit reached; ${String(uncheckedUrls.length)} sitemaps were not checked`,
    targetValue,
    help: 'The sitemap fetch budget was exhausted. Remaining sitemap URLs were not requested.',
  });
}
