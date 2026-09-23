import type { PageSnapshot } from '../model/page.js';

/** A source page can be compared only when its final response is a successful 2xx. */
export function isSourceComparisonBaseline(snapshot: PageSnapshot): boolean {
  return (
    snapshot.fetchError === null &&
    !snapshot.redirectLoop &&
    !snapshot.redirectHopLimitExceeded &&
    !snapshot.crossOriginRedirectStopped &&
    isSuccessStatus(snapshot.status)
  );
}

/**
 * The source already answered 404 or 410, so there is no migration baseline to compare.
 * Redirect and fetch failures are not treated as a known-missing page.
 */
export function isKnownMissingSource(snapshot: PageSnapshot): boolean {
  return (
    snapshot.fetchError === null &&
    !snapshot.redirectLoop &&
    !snapshot.redirectHopLimitExceeded &&
    !snapshot.crossOriginRedirectStopped &&
    (snapshot.status === 404 || snapshot.status === 410)
  );
}

/** Why a source page cannot be a comparison baseline. Null when it can, or when it is already 404/410. */
export function sourceBaselineFailure(snapshot: PageSnapshot): string | null {
  if (isSourceComparisonBaseline(snapshot) || isKnownMissingSource(snapshot)) {
    return null;
  }
  return sourceUnusableReason(snapshot);
}

export function sourceRootBaselineMessage(snapshot: PageSnapshot | undefined): string {
  if (snapshot === undefined) {
    return 'Source baseline could not be fetched.';
  }
  const reason = sourceUnusableReason(snapshot);
  if (reason.startsWith('HTTP ')) {
    return `Source baseline returned ${reason}.`;
  }
  if (reason === 'redirect loop') {
    return 'Source baseline stopped on a redirect loop.';
  }
  if (reason === 'redirect hop limit') {
    return 'Source baseline exceeded the redirect hop limit.';
  }
  if (reason === 'cross-origin redirect') {
    return 'Source baseline stopped at a cross-origin redirect.';
  }
  if (reason === 'no HTTP status') {
    return 'Source baseline could not be fetched (no HTTP status).';
  }
  return `Source baseline could not be fetched (${reason}).`;
}

function sourceUnusableReason(snapshot: PageSnapshot): string {
  if (snapshot.fetchError !== null) {
    return snapshot.fetchError.code;
  }
  if (snapshot.redirectLoop) {
    return 'redirect loop';
  }
  if (snapshot.redirectHopLimitExceeded) {
    return 'redirect hop limit';
  }
  if (snapshot.crossOriginRedirectStopped) {
    return 'cross-origin redirect';
  }
  if (snapshot.status === null) {
    return 'no HTTP status';
  }
  return `HTTP ${String(snapshot.status)}`;
}

function isSuccessStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}
