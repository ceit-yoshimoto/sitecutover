import type { PageSnapshot } from '../model/page.js';

export function pageSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  const requestedUrl = overrides.requestedUrl ?? 'https://example.com/';
  return {
    requestedUrl,
    finalUrl: overrides.finalUrl ?? requestedUrl,
    status: 'status' in overrides ? (overrides.status ?? null) : 200,
    redirectHops: overrides.redirectHops ?? [],
    contentType:
      'contentType' in overrides ? (overrides.contentType ?? null) : 'text/html; charset=utf-8',
    xRobotsTag: 'xRobotsTag' in overrides ? (overrides.xRobotsTag ?? null) : null,
    internalLinks: overrides.internalLinks ?? [],
    title: 'title' in overrides ? (overrides.title ?? null) : null,
    metaDescription: 'metaDescription' in overrides ? (overrides.metaDescription ?? null) : null,
    canonical: 'canonical' in overrides ? (overrides.canonical ?? null) : null,
    metaRobots: 'metaRobots' in overrides ? (overrides.metaRobots ?? null) : null,
    fetchError: 'fetchError' in overrides ? (overrides.fetchError ?? null) : null,
    redirectLoop: overrides.redirectLoop ?? false,
    redirectHopLimitExceeded: overrides.redirectHopLimitExceeded ?? false,
    crossOriginRedirectStopped: overrides.crossOriginRedirectStopped ?? false,
  };
}
