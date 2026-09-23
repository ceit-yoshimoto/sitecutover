import { parseHtmlDocument, readAttribute, walkHtmlElements } from './html-tree.js';

export function extractLinks(html: string): string[] {
  const hrefs: string[] = [];
  walkHtmlElements(parseHtmlDocument(html), (element) => {
    if (element.tagName !== 'a' && element.tagName !== 'area') {
      return;
    }
    const href = readAttribute(element, 'href');
    if (href !== null) {
      hrefs.push(href);
    }
  });
  return hrefs;
}
