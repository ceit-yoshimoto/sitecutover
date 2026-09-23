export const DEFAULT_MAX_PAGES = 250;
export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_PAGES_LIMIT = 5_000;
export const MAX_CONCURRENCY_LIMIT = 20;
/** Additional SC007 fetches. v0.1 sets this from `--max-pages`. */
export const MAX_LINK_FETCHES_LIMIT = MAX_PAGES_LIMIT;
/** Sitemap documents fetched per origin. `robots.txt` is not part of this budget. */
export const DEFAULT_MAX_SITEMAPS = 50;
export const MAX_SITEMAPS_LIMIT = 200;
