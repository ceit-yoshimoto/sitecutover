import type { FetchError } from '../model/page.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export function resolveRedirectLocation(
  currentUrl: string,
  location: string,
): { url: URL } | { error: FetchError } {
  let next: URL;
  try {
    next = new URL(location, currentUrl);
  } catch {
    return {
      error: {
        code: 'REDIRECT_INVALID_LOCATION',
        message: 'Redirect Location is not a valid URL',
      },
    };
  }

  next.hash = '';
  if (next.username !== '' || next.password !== '') {
    return {
      error: {
        code: 'CREDENTIALS_IN_URL',
        message: 'Redirect Location must not include credentials',
      },
    };
  }
  if (next.protocol !== 'http:' && next.protocol !== 'https:') {
    return {
      error: {
        code: 'UNSUPPORTED_PROTOCOL',
        message: 'Redirect Location must use http or https',
      },
    };
  }

  return { url: next };
}
