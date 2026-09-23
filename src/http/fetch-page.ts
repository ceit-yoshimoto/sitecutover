import { AuditModelError } from '../model/errors.js';
import {
  copyPageSnapshot,
  type FetchError,
  type PageSnapshot,
  type RedirectHop,
} from '../model/page.js';
import { isRedirectStatus, resolveRedirectLocation } from './redirect-trace.js';

export const DEFAULT_MAX_REDIRECT_HOPS = 10;
export const DEFAULT_MAX_BODY_BYTES = 2_000_000;

export const MAX_REDIRECT_HOPS_LIMIT = 20;
export const MAX_TIMEOUT_MS_LIMIT = 120_000;
const MAX_BODY_BYTES = 5_000_000;

export interface FetchPageOptions {
  timeoutMs: number;
  userAgent: string;
  maxRedirectHops?: number;
  maxBodyBytes?: number;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  redirectHops: readonly RedirectHop[];
  contentType: string | null;
  xRobotsTag: string | null;
  body: string | null;
  fetchError: FetchError | null;
  redirectLoop: boolean;
  redirectHopLimitExceeded: boolean;
  crossOriginRedirectStopped: boolean;
}

interface ResolvedOptions {
  timeoutMs: number;
  userAgent: string;
  maxRedirectHops: number;
  maxBodyBytes: number;
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
}

export async function fetchPage(rawUrl: string, options: FetchPageOptions): Promise<FetchResult> {
  const settings = resolveOptions(options);
  const initial = classifyUrl(rawUrl);
  if ('error' in initial) {
    return result({
      requestedUrl: initial.safeUrl,
      finalUrl: initial.safeUrl,
      fetchError: initial.error,
    });
  }

  const hops: RedirectHop[] = [];
  const visited = new Set<string>();
  let current = initial.url;
  const maxAttempts = settings.maxRedirectHops + 1;

  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const href = safeHref(current);
    if (visited.has(href)) {
      const previous = hops.at(-1);
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: previous?.url ?? href,
        status: previous?.status ?? null,
        redirectHops: hops,
        redirectLoop: true,
      });
    }
    visited.add(href);

    let response: Response;
    try {
      response = await settings.fetchImpl(href, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'user-agent': settings.userAgent },
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
    } catch (error) {
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: href,
        redirectHops: hops,
        fetchError: toFetchError(error),
      });
    }

    if (!isRedirectStatus(response.status)) {
      const contentType = response.headers.get('content-type');
      const loaded = await readBody(response, settings.maxBodyBytes, contentType);
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: href,
        status: response.status,
        redirectHops: hops,
        contentType,
        xRobotsTag: response.headers.get('x-robots-tag'),
        body: loaded.body,
        fetchError: loaded.error,
      });
    }

    hops.push({ url: href, status: response.status });
    if (hops.length > settings.maxRedirectHops) {
      await discardBody(response);
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: href,
        status: response.status,
        redirectHops: hops,
        contentType: response.headers.get('content-type'),
        xRobotsTag: response.headers.get('x-robots-tag'),
        redirectHopLimitExceeded: true,
      });
    }

    const location = response.headers.get('location');
    await discardBody(response);
    if (location === null || location.trim().length === 0) {
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: href,
        status: response.status,
        redirectHops: hops,
        fetchError: {
          code: 'REDIRECT_MISSING_LOCATION',
          message: 'Redirect response did not include a Location header',
        },
      });
    }

    const next = resolveRedirectLocation(href, location);
    if ('error' in next) {
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: href,
        status: response.status,
        redirectHops: hops,
        fetchError: next.error,
      });
    }
    if (next.url.origin !== initial.url.origin) {
      return result({
        requestedUrl: initial.safeUrl,
        finalUrl: safeHref(next.url),
        redirectHops: hops,
        xRobotsTag: response.headers.get('x-robots-tag'),
        crossOriginRedirectStopped: true,
      });
    }
    current = next.url;
  }

  const lastHop = hops.at(-1);
  return result({
    requestedUrl: initial.safeUrl,
    finalUrl: lastHop?.url ?? safeHref(current),
    status: lastHop?.status ?? null,
    redirectHops: hops,
    redirectHopLimitExceeded: true,
  });
}

export function toPageSnapshot(fetched: FetchResult): PageSnapshot {
  return copyPageSnapshot({
    requestedUrl: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    redirectHops: fetched.redirectHops,
    contentType: fetched.contentType,
    xRobotsTag: fetched.xRobotsTag,
    internalLinks: [],
    title: null,
    metaDescription: null,
    canonical: null,
    metaRobots: null,
    fetchError: fetched.fetchError,
    redirectLoop: fetched.redirectLoop,
    redirectHopLimitExceeded: fetched.redirectHopLimitExceeded,
    crossOriginRedirectStopped: fetched.crossOriginRedirectStopped,
  });
}

function resolveOptions(options: FetchPageOptions): ResolvedOptions {
  return {
    timeoutMs: readBoundedInteger(options.timeoutMs, 'timeoutMs', 1, MAX_TIMEOUT_MS_LIMIT),
    userAgent: readUserAgent(options.userAgent),
    maxRedirectHops: readBoundedInteger(
      options.maxRedirectHops ?? DEFAULT_MAX_REDIRECT_HOPS,
      'maxRedirectHops',
      0,
      MAX_REDIRECT_HOPS_LIMIT,
    ),
    maxBodyBytes: readBoundedInteger(
      options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      'maxBodyBytes',
      1,
      MAX_BODY_BYTES,
    ),
    fetchImpl: options.fetchImpl ?? defaultFetch,
  };
}

async function defaultFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function result(partial: {
  requestedUrl: string;
  finalUrl: string;
  status?: number | null;
  redirectHops?: readonly RedirectHop[];
  contentType?: string | null;
  xRobotsTag?: string | null;
  body?: string | null;
  fetchError?: FetchError | null;
  redirectLoop?: boolean;
  redirectHopLimitExceeded?: boolean;
  crossOriginRedirectStopped?: boolean;
}): FetchResult {
  return {
    requestedUrl: partial.requestedUrl,
    finalUrl: partial.finalUrl,
    status: partial.status ?? null,
    redirectHops: partial.redirectHops ?? [],
    contentType: partial.contentType ?? null,
    xRobotsTag: partial.xRobotsTag ?? null,
    body: partial.body ?? null,
    fetchError: partial.fetchError ?? null,
    redirectLoop: partial.redirectLoop ?? false,
    redirectHopLimitExceeded: partial.redirectHopLimitExceeded ?? false,
    crossOriginRedirectStopped: partial.crossOriginRedirectStopped ?? false,
  };
}

function classifyUrl(
  rawUrl: string,
): { url: URL; safeUrl: string } | { safeUrl: string; error: FetchError } {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return {
      safeUrl: '(invalid)',
      error: { code: 'INVALID_URL', message: 'URL must be absolute' },
    };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      safeUrl: rawUrl,
      error: { code: 'INVALID_URL', message: 'URL must be absolute' },
    };
  }

  if (url.username !== '' || url.password !== '') {
    url.username = '';
    url.password = '';
    url.hash = '';
    return {
      safeUrl: url.href,
      error: { code: 'CREDENTIALS_IN_URL', message: 'URL must not include credentials' },
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    url.hash = '';
    return {
      safeUrl: url.href,
      error: { code: 'UNSUPPORTED_PROTOCOL', message: 'URL must use http or https' },
    };
  }

  url.hash = '';
  return { url, safeUrl: url.href };
}

function safeHref(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  copy.username = '';
  copy.password = '';
  return copy.href;
}

async function readBody(
  response: Response,
  maxBodyBytes: number,
  contentType: string | null,
): Promise<{ body: string | null; error: FetchError | null }> {
  if (!shouldReadBody(contentType)) {
    await discardBody(response);
    return { body: null, error: null };
  }
  if (response.body === null) {
    return { body: '', error: null };
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const readResult = await reader.read();
      if (readResult.done) {
        break;
      }
      received += readResult.value.byteLength;
      if (received > maxBodyBytes) {
        await reader.cancel();
        return {
          body: null,
          error: {
            code: 'BODY_TOO_LARGE',
            message: 'The response body exceeded the size limit',
          },
        };
      }
      chunks.push(readResult.value);
    }
  } catch (error) {
    return { body: null, error: toFetchError(error) };
  }

  return { body: decodeBody(chunks, received, contentType), error: null };
}

function shouldReadBody(contentType: string | null): boolean {
  if (contentType === null) {
    return true;
  }
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    mime === 'text/html' ||
    mime === 'application/xhtml+xml' ||
    mime === 'text/xml' ||
    mime === 'application/xml' ||
    mime === 'text/plain' ||
    mime.endsWith('+xml')
  );
}

function decodeBody(
  chunks: readonly Uint8Array[],
  total: number,
  contentType: string | null,
): string {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoder;
  try {
    decoder = new TextDecoder(charsetOf(contentType), { fatal: false });
  } catch {
    decoder = new TextDecoder('utf-8', { fatal: false });
  }
  return decoder.decode(bytes);
}

function charsetOf(contentType: string | null): string {
  if (contentType === null) {
    return 'utf-8';
  }
  const match = /charset=([^;]+)/i.exec(contentType);
  const raw = match?.[1]?.trim().replaceAll('"', '').toLowerCase();
  if (raw === undefined || raw.length === 0 || raw === 'utf8') {
    return 'utf-8';
  }
  return raw;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The status and redirect trace remain usable when the unread body cannot be cancelled.
  }
}

function toFetchError(error: unknown): FetchError {
  if (isTimeoutError(error)) {
    return { code: 'TIMEOUT', message: 'The request timed out' };
  }
  return { code: nodeErrorCode(error) ?? 'NETWORK', message: 'The request failed' };
}

function isTimeoutError(error: unknown, depth = 0): boolean {
  if (depth > 5 || typeof error !== 'object' || error === null) {
    return false;
  }
  if ('name' in error && error.name === 'TimeoutError') {
    return true;
  }
  if ('cause' in error) {
    return isTimeoutError(error.cause, depth + 1);
  }
  return false;
}

function nodeErrorCode(error: unknown, depth = 0): string | null {
  if (depth > 5 || typeof error !== 'object' || error === null) {
    return null;
  }
  if ('code' in error && typeof error.code === 'string' && error.code.length > 0) {
    return error.code;
  }
  if ('cause' in error) {
    const causeCode = nodeErrorCode(error.cause, depth + 1);
    if (causeCode !== null) {
      return causeCode;
    }
  }
  if ('errors' in error && Array.isArray(error.errors)) {
    for (const nested of error.errors) {
      const nestedCode = nodeErrorCode(nested, depth + 1);
      if (nestedCode !== null) {
        return nestedCode;
      }
    }
  }
  return null;
}

function readUserAgent(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value)) {
    throw new AuditModelError('userAgent must be a single-line non-empty string');
  }
  return value;
}

function readBoundedInteger(value: number, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new AuditModelError(`${label} must be an integer from ${String(min)} to ${String(max)}`);
  }
  return value;
}
