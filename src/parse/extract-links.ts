export interface HtmlElement {
  name: string;
  raw: string;
  inSvg: boolean;
  text: string | null;
}

export function extractLinks(html: string): string[] {
  const hrefs: string[] = [];
  for (const element of readHtmlElements(html)) {
    if (element.name !== 'a' && element.name !== 'area') {
      continue;
    }
    const href = readTagAttribute(element.raw, 'href');
    if (href !== null) {
      hrefs.push(href);
    }
  }
  return hrefs;
}

export function readHtmlElements(html: string): HtmlElement[] {
  const elements: HtmlElement[] = [];
  let index = 0;
  let svgDepth = 0;

  while (index < html.length) {
    if (startsWith(html, index, '<!--')) {
      const end = indexOfIgnoreCase(html, '-->', index + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }

    if (charAt(html, index) !== '<') {
      index += 1;
      continue;
    }

    if (opensClosingTag(html, index, 'svg')) {
      svgDepth = Math.max(0, svgDepth - 1);
      index = skipTag(html, index);
      continue;
    }

    if (opensTag(html, index, 'script') || opensTag(html, index, 'style')) {
      const name = opensTag(html, index, 'script') ? 'script' : 'style';
      const end = indexOfIgnoreCase(html, `</${name}`, index + name.length + 1);
      index = end === -1 ? html.length : end + name.length + 3;
      continue;
    }

    const name = readTagName(html, index);
    if (name === null) {
      index += 1;
      continue;
    }

    const tagEnd = html.indexOf('>', index);
    if (tagEnd === -1) {
      break;
    }
    const raw = html.slice(index, tagEnd + 1);
    const inSvg = svgDepth > 0;
    if (name === 'title') {
      const close = indexOfIgnoreCase(html, '</title', tagEnd + 1);
      const text = close === -1 ? html.slice(tagEnd + 1) : html.slice(tagEnd + 1, close);
      elements.push({ name, raw, inSvg, text });
      index = close === -1 ? html.length : close + '</title>'.length;
      continue;
    }

    elements.push({ name, raw, inSvg, text: null });
    if (name === 'svg') {
      svgDepth += 1;
    }
    index = tagEnd + 1;
  }

  return elements;
}

export function readTagAttribute(tag: string, attributeName: string): string | null {
  let index = 1;
  while (index < tag.length && !isWhitespace(charAt(tag, index)) && charAt(tag, index) !== '>') {
    index += 1;
  }

  while (index < tag.length) {
    while (isWhitespace(charAt(tag, index))) {
      index += 1;
    }
    if (index >= tag.length || charAt(tag, index) === '>' || charAt(tag, index) === '/') {
      break;
    }

    const nameStart = index;
    while (index < tag.length && isNameCharacter(charAt(tag, index))) {
      index += 1;
    }
    const name = tag.slice(nameStart, index).toLowerCase();
    while (isWhitespace(charAt(tag, index))) {
      index += 1;
    }
    if (charAt(tag, index) !== '=') {
      continue;
    }
    index += 1;
    while (isWhitespace(charAt(tag, index))) {
      index += 1;
    }

    const quote = charAt(tag, index);
    let value: string;
    if (quote === '"' || quote === "'") {
      const end = tag.indexOf(quote, index + 1);
      if (end === -1) {
        return null;
      }
      value = tag.slice(index + 1, end);
      index = end + 1;
    } else {
      const valueStart = index;
      while (
        index < tag.length &&
        !isWhitespace(charAt(tag, index)) &&
        charAt(tag, index) !== '>'
      ) {
        index += 1;
      }
      value = tag.slice(valueStart, index);
    }

    if (name === attributeName.toLowerCase()) {
      const trimmed = decodeHtmlText(value).trim();
      return trimmed.length === 0 ? null : trimmed;
    }
  }

  return null;
}

export function decodeHtmlText(value: string): string {
  return value.replaceAll(/&(?:#x[0-9a-fA-F]+|#\d+|amp|quot|apos|lt|gt|nbsp);/g, (entity) => {
    switch (entity) {
      case '&amp;':
        return '&';
      case '&quot;':
        return '"';
      case '&apos;':
        return "'";
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&nbsp;':
        return ' ';
      default: {
        const codePoint = entity.startsWith('&#x')
          ? Number.parseInt(entity.slice(3, -1), 16)
          : Number.parseInt(entity.slice(2, -1), 10);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
          return entity;
        }
        return String.fromCodePoint(codePoint);
      }
    }
  });
}

function readTagName(html: string, index: number): string | null {
  if (charAt(html, index) !== '<' || charAt(html, index + 1) === '/') {
    return null;
  }
  let cursor = index + 1;
  const start = cursor;
  while (cursor < html.length && isNameCharacter(charAt(html, cursor))) {
    cursor += 1;
  }
  if (cursor === start) {
    return null;
  }
  const boundary = charAt(html, cursor);
  if (boundary !== '' && boundary !== '>' && boundary !== '/' && !isWhitespace(boundary)) {
    return null;
  }
  return html.slice(start, cursor).toLowerCase();
}

function opensClosingTag(html: string, index: number, name: string): boolean {
  if (!startsWith(html, index, `</${name}`)) {
    return false;
  }
  const boundary = charAt(html, index + name.length + 2);
  return boundary === '' || boundary === '>' || isWhitespace(boundary);
}

function skipTag(html: string, index: number): number {
  const tagEnd = html.indexOf('>', index);
  return tagEnd === -1 ? html.length : tagEnd + 1;
}

function opensTag(html: string, index: number, name: string): boolean {
  if (!startsWith(html, index, `<${name}`)) {
    return false;
  }
  const boundary = charAt(html, index + name.length + 1);
  return boundary === '' || boundary === '>' || boundary === '/' || isWhitespace(boundary);
}

function startsWith(html: string, index: number, needle: string): boolean {
  return html.slice(index, index + needle.length).toLowerCase() === needle.toLowerCase();
}

function indexOfIgnoreCase(html: string, needle: string, from: number): number {
  const haystack = html.toLowerCase();
  return haystack.indexOf(needle.toLowerCase(), from);
}

function charAt(value: string, index: number): string {
  return value[index] ?? '';
}

function isWhitespace(value: string): boolean {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f';
}

function isNameCharacter(value: string): boolean {
  return /[A-Za-z0-9_:-]/u.test(value);
}
