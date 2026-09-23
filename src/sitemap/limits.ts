/**
 * Maximum sitemap or robots.txt body kept in memory during discovery.
 * A larger body is not parsed. v0.1 does not stream sitemap XML.
 */
export const SITEMAP_MAX_BODY_BYTES = 2_000_000;
