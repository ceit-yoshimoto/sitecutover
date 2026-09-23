const UNRESERVED = /^[A-Za-z0-9\-._~]$/u;

/**
 * Canonical HTTP(S) URL for crawl deduplication.
 *
 * Fragments are removed. Default ports are removed. Repeated slashes stay,
 * because `/a//b` and `/a/b` can be different resources. Trailing slashes stay
 * for the same reason.
 * Query parameter order and repeated keys stay as written. Percent-encoding of
 * unreserved characters is decoded, and other percent-encoding is uppercased.
 * Encoded reserved characters such as `%2F` are not turned into path separators.
 */
export function normalizeHttpUrl(input: string, base?: string): string | null {
  if (input.trim().length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = base === undefined ? new URL(input) : new URL(input, base);
  } catch {
    return null;
  }

  if (url.username !== '' || url.password !== '') {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const withoutHash = url.hash.length > 0 ? url.href.slice(0, -url.hash.length) : url.href;
  const emptyQuery = withoutHash.endsWith('?');
  url.hash = '';
  url.pathname = normalizePercentEncoding(url.pathname);
  if (url.search.length > 0) {
    url.search = normalizePercentEncoding(url.search);
  }

  if (emptyQuery && !url.href.includes('?')) {
    return `${url.href}?`;
  }
  return url.href;
}

function normalizePercentEncoding(value: string): string {
  return value.replaceAll(/%[0-9A-Fa-f]{2}/g, (encoded) => {
    const byte = Number.parseInt(encoded.slice(1), 16);
    const character = String.fromCharCode(byte);
    if (UNRESERVED.test(character)) {
      return character;
    }
    return `%${encoded.slice(1).toUpperCase()}`;
  });
}
