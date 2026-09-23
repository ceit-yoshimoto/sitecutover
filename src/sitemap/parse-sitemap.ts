export interface ParsedSitemap {
  kind: 'urlset' | 'sitemapindex';
  locs: readonly string[];
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Reads `<loc>` values from a sitemap urlset or sitemap index.
 * Rejects DOCTYPE and other declarations so no external entity is fetched.
 * Returns null when the document is not a recognizable sitemap.
 */
export function parseSitemapXml(xml: string): ParsedSitemap | null {
  if (xml.includes('\0')) {
    return null;
  }
  const source = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  if (/<!DOCTYPE/i.test(source)) {
    return null;
  }
  return readDocument(source);
}

function readDocument(source: string): ParsedSitemap | null {
  const stack: string[] = [];
  let root: ParsedSitemap['kind'] | null = null;
  const locs: string[] = [];
  const seen = new Set<string>();
  let locBuffer: string | null = null;
  let index = 0;

  while (index < source.length) {
    if (source[index] !== '<') {
      const next = source.indexOf('<', index);
      const text = source.slice(index, next === -1 ? source.length : next);
      if (locBuffer !== null) {
        locBuffer += text;
      } else if ((stack.length === 0 && text.trim().length > 0) || next === -1) {
        if (text.trim().length > 0 || stack.length > 0) {
          return null;
        }
      }
      if (next === -1) {
        break;
      }
      index = next;
      continue;
    }

    const markup = readMarkup(source, index);
    if (markup === null) {
      return null;
    }
    index = markup.next;

    if (markup.kind === 'cdata') {
      if (locBuffer === null) {
        return null;
      }
      locBuffer += markup.text;
      continue;
    }
    if (markup.kind === 'end') {
      const open = stack.pop();
      if (open !== markup.name) {
        return null;
      }
      if (markup.name === 'loc' && locBuffer !== null) {
        const decoded = decodeXmlText(locBuffer.trim());
        if (decoded === null) {
          return null;
        }
        if (decoded.length > 0 && !seen.has(decoded)) {
          seen.add(decoded);
          locs.push(decoded);
        }
        locBuffer = null;
      }
      continue;
    }
    if (markup.kind !== 'start') {
      continue;
    }
    if (locBuffer !== null) {
      return null;
    }
    if (root === null) {
      if (markup.name !== 'urlset' && markup.name !== 'sitemapindex') {
        return null;
      }
      root = markup.name;
    } else if (stack.length === 0) {
      return null;
    }
    if (!markup.selfClosing) {
      const parent = stack.at(-1);
      stack.push(markup.name);
      if (markup.name === 'loc' && (parent === 'url' || parent === 'sitemap')) {
        locBuffer = '';
      }
    }
  }

  if (stack.length > 0 || root === null || locBuffer !== null) {
    return null;
  }
  return { kind: root, locs };
}

type Markup =
  | { kind: 'start'; name: string; selfClosing: boolean; next: number }
  | { kind: 'end'; name: string; next: number }
  | { kind: 'cdata'; text: string; next: number }
  | { kind: 'skip'; next: number };

function readMarkup(source: string, start: number): Markup | null {
  if (source.startsWith('<!--', start)) {
    const end = source.indexOf('-->', start + 4);
    if (end === -1) {
      return null;
    }
    return { kind: 'skip', next: end + 3 };
  }
  if (source.startsWith('<?', start)) {
    const end = source.indexOf('?>', start + 2);
    if (end === -1) {
      return null;
    }
    return { kind: 'skip', next: end + 2 };
  }
  if (source.startsWith('<![CDATA[', start)) {
    const end = source.indexOf(']]>', start + 9);
    if (end === -1) {
      return null;
    }
    return { kind: 'cdata', text: source.slice(start + 9, end), next: end + 3 };
  }
  if (source.startsWith('<!', start)) {
    return null;
  }
  if (source.startsWith('</', start)) {
    const close = findTagEnd(source, start + 2);
    if (close === null) {
      return null;
    }
    const name = endTagName(source.slice(start + 2, close));
    if (name === null) {
      return null;
    }
    return { kind: 'end', name, next: close + 1 };
  }

  const close = findTagEnd(source, start + 1);
  if (close === null) {
    return null;
  }
  const info = parseStartTag(source.slice(start + 1, close));
  if (info === null) {
    return null;
  }
  return { kind: 'start', name: info.name, selfClosing: info.selfClosing, next: close + 1 };
}

function findTagEnd(source: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) {
      return null;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return index;
    }
  }
  return null;
}

function parseStartTag(inner: string): { name: string; selfClosing: boolean } | null {
  let quote: '"' | "'" | null = null;
  let nameEnd = -1;
  let selfClosing = false;
  let index = 0;
  while (index < inner.length && isSpace(inner[index])) {
    index += 1;
  }
  const nameStart = index;
  for (; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === undefined) {
      break;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (nameEnd === -1 && isSpace(char)) {
      nameEnd = index;
    }
    if (char === '/') {
      selfClosing = true;
    } else if (!isSpace(char)) {
      selfClosing = false;
    }
  }
  if (quote !== null) {
    return null;
  }
  if (nameEnd === -1) {
    nameEnd = inner.length;
  }
  let token = inner.slice(nameStart, nameEnd).trim();
  if (token.endsWith('/')) {
    selfClosing = true;
    token = token.slice(0, -1);
  }
  const name = localName(token);
  if (name === null) {
    return null;
  }
  return { name, selfClosing };
}

function endTagName(inner: string): string | null {
  const trimmed = inner.trim();
  if (trimmed.length === 0 || /\s/u.test(trimmed)) {
    return null;
  }
  return localName(trimmed);
}

function localName(token: string): string | null {
  if (!/^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/u.test(token)) {
    return null;
  }
  const colon = token.lastIndexOf(':');
  return (colon === -1 ? token : token.slice(colon + 1)).toLowerCase();
}

function decodeXmlText(value: string): string | null {
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === undefined) {
      break;
    }
    if (char !== '&') {
      decoded += char;
      continue;
    }
    const semi = value.indexOf(';', index + 1);
    if (semi === -1) {
      return null;
    }
    const token = value.slice(index + 1, semi);
    const entity = decodeEntity(token);
    if (entity === null) {
      return null;
    }
    decoded += entity;
    index = semi;
  }
  return decoded;
}

function decodeEntity(token: string): string | null {
  if (token.startsWith('#')) {
    const hex = token.startsWith('#x') || token.startsWith('#X');
    const digits = token.slice(hex ? 2 : 1);
    if (!/^[0-9A-Fa-f]+$/u.test(digits)) {
      return null;
    }
    const code = Number.parseInt(digits, hex ? 16 : 10);
    if (!isXmlCodePoint(code)) {
      return null;
    }
    return String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[token] ?? null;
}

function isXmlCodePoint(code: number): boolean {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return false;
  }
  if (code >= 0xd800 && code <= 0xdfff) {
    return false;
  }
  if (code === 0xfffe || code === 0xffff) {
    return false;
  }
  return code >= 0x20 || code === 0x9 || code === 0xa || code === 0xd;
}

function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}
