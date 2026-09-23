/** URLs copied into a finding when a fetch budget is exhausted. */
export const UNCHECKED_URL_SAMPLE_LIMIT = 100;

export interface UncheckedUrlSample {
  uncheckedCount: number;
  uncheckedUrls: string[];
  uncheckedUrlsTruncated: boolean;
}

/**
 * Keeps `uncheckedCount` exact and copies a deterministic prefix into the finding.
 * Callers pass URLs in the order they want sampled. The first entries are kept.
 */
export function sampleUncheckedUrls(urls: readonly string[]): UncheckedUrlSample {
  return {
    uncheckedCount: urls.length,
    uncheckedUrls: urls.slice(0, UNCHECKED_URL_SAMPLE_LIMIT),
    uncheckedUrlsTruncated: urls.length > UNCHECKED_URL_SAMPLE_LIMIT,
  };
}
