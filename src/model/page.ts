import { AuditModelError } from './errors.js';

export interface RedirectHop {
  url: string;
  status: number;
}

export interface FetchError {
  code: string;
  message: string;
}

export interface PageSnapshot {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  redirectHops: readonly RedirectHop[];
  contentType: string | null;
  xRobotsTag: string | null;
  internalLinks: readonly string[];
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  fetchError: FetchError | null;
  redirectLoop: boolean;
  redirectHopLimitExceeded: boolean;
}

export interface PagePair {
  path: string;
  source: PageSnapshot | null;
  target: PageSnapshot | null;
}

export function copyPageSnapshot(snapshot: PageSnapshot): PageSnapshot {
  return {
    requestedUrl: requireText(snapshot.requestedUrl, 'requestedUrl'),
    finalUrl: requireText(snapshot.finalUrl, 'finalUrl'),
    status: requireStatus(snapshot.status, 'status'),
    redirectHops: snapshot.redirectHops.map((hop, index) => copyHop(hop, index)),
    contentType: requireNullableText(snapshot.contentType, 'contentType'),
    xRobotsTag: requireNullableText(snapshot.xRobotsTag, 'xRobotsTag'),
    internalLinks: snapshot.internalLinks.map((link, index) =>
      requireText(link, `internalLinks[${String(index)}]`),
    ),
    title: requireNullableText(snapshot.title, 'title'),
    metaDescription: requireNullableText(snapshot.metaDescription, 'metaDescription'),
    canonical: requireNullableText(snapshot.canonical, 'canonical'),
    metaRobots: requireNullableText(snapshot.metaRobots, 'metaRobots'),
    fetchError: snapshot.fetchError === null ? null : copyFetchError(snapshot.fetchError),
    redirectLoop: requireBoolean(snapshot.redirectLoop, 'redirectLoop'),
    redirectHopLimitExceeded: requireBoolean(
      snapshot.redirectHopLimitExceeded,
      'redirectHopLimitExceeded',
    ),
  };
}

export function copyPagePair(pair: PagePair): PagePair {
  return {
    path: requireText(pair.path, 'path'),
    source: pair.source === null ? null : copyPageSnapshot(pair.source),
    target: pair.target === null ? null : copyPageSnapshot(pair.target),
  };
}

function copyHop(hop: RedirectHop, index: number): RedirectHop {
  const label = `redirectHops[${String(index)}]`;
  const status = requireStatus(hop.status, `${label}.status`);
  if (status === null) {
    throw new AuditModelError(`${label}.status must be an HTTP status`);
  }
  return {
    url: requireText(hop.url, `${label}.url`),
    status,
  };
}

function copyFetchError(error: FetchError): FetchError {
  return {
    code: requireText(error.code, 'fetchError.code'),
    message: requireText(error.message, 'fetchError.message'),
  };
}

function requireText(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AuditModelError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireNullableText(value: string | null, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AuditModelError(`${label} must be a string or null`);
  }
  return value;
}

function requireBoolean(value: boolean, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AuditModelError(`${label} must be a boolean`);
  }
  return value;
}

function requireStatus(value: number | null, label: string): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 100 || value > 599) {
    throw new AuditModelError(`${label} must be an integer HTTP status or null`);
  }
  return value;
}
