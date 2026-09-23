import { normalizeHttpUrl } from '../crawl/normalize-url.js';
import {
  elementText,
  parseHtmlDocument,
  readAttribute,
  walkHtmlElements,
  type HtmlElementNode,
} from './html-tree.js';

export interface ParsedHtml {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  links: readonly string[];
}

export function parseHtml(html: string, pageUrl: string): ParsedHtml {
  let title: string | null = null;
  let metaDescription: string | null = null;
  let metaRobots: string | null = null;
  let canonicalHref: string | null = null;
  let baseHref: string | null = null;
  const rawLinks: string[] = [];

  walkHtmlElements(parseHtmlDocument(html), (element) => {
    if (element.tagName === 'base' && baseHref === null) {
      baseHref = readAttribute(element, 'href');
    }

    if (element.tagName === 'title' && title === null) {
      title = elementText(element);
    }

    if (element.tagName === 'meta') {
      const name = readAttribute(element, 'name')?.toLowerCase();
      if (name === 'description' && metaDescription === null) {
        metaDescription = normalizeText(readAttribute(element, 'content') ?? '');
      }
      if (name === 'robots') {
        metaRobots = joinRobots(metaRobots, readAttribute(element, 'content'));
      }
    }

    if (element.tagName === 'link' && canonicalHref === null && hasRel(element, 'canonical')) {
      canonicalHref = readAttribute(element, 'href') ?? '';
    }

    if (element.tagName === 'a' || element.tagName === 'area') {
      const href = readAttribute(element, 'href');
      if (href !== null) {
        rawLinks.push(href);
      }
    }
  });

  const base = resolveBase(baseHref, pageUrl);
  const links: string[] = [];
  const seenLinks = new Set<string>();
  for (const href of rawLinks) {
    const normalized = normalizeHttpUrl(href, base);
    if (normalized === null || seenLinks.has(normalized)) {
      continue;
    }
    seenLinks.add(normalized);
    links.push(normalized);
  }

  return {
    title,
    metaDescription,
    canonical: resolveCanonical(canonicalHref, base),
    metaRobots,
    links,
  };
}

export function normalizeRobotsDirectives(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return joinRobots(null, value);
}

function joinRobots(current: string | null, addition: string | null): string | null {
  const tokens = new Set<string>();
  const ordered: string[] = [];
  for (const source of [current, addition]) {
    if (source === null) {
      continue;
    }
    for (const part of source.split(',')) {
      const token = part.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
      if (token.length === 0 || tokens.has(token)) {
        continue;
      }
      tokens.add(token);
      ordered.push(token);
    }
  }
  return ordered.length === 0 ? null : ordered.join(', ');
}

function resolveBase(baseHref: string | null, pageUrl: string): string {
  if (baseHref === null) {
    return pageUrl;
  }
  return normalizeHttpUrl(baseHref, pageUrl) ?? pageUrl;
}

function resolveCanonical(href: string | null, base: string): string | null {
  if (href === null) {
    return null;
  }
  const trimmed = href.trim();
  if (trimmed.length === 0) {
    return '';
  }
  return normalizeHttpUrl(trimmed, base) ?? trimmed;
}

function hasRel(element: HtmlElementNode, token: string): boolean {
  const rel = readAttribute(element, 'rel');
  if (rel === null) {
    return false;
  }
  return rel.split(/\s+/u).some((part) => part.toLowerCase() === token);
}

function normalizeText(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}
