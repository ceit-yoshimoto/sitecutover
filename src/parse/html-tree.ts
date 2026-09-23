import { parse, type DefaultTreeAdapterTypes } from 'parse5';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type Template = DefaultTreeAdapterTypes.Template;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg' as Element['namespaceURI'];

export type { Element as HtmlElementNode };

/**
 * Parse HTML with scripting disabled so `<noscript>` links stay visible.
 * Script and style contents stay text, and SVG stays in the SVG namespace.
 */
export function parseHtmlDocument(html: string): DefaultTreeAdapterTypes.Document {
  return parse(html, { scriptingEnabled: false });
}

export function walkHtmlElements(root: ParentNode, visit: (element: Element) => void): void {
  for (const child of root.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    if (child.namespaceURI !== SVG_NAMESPACE) {
      visit(child);
    }
    if (isTemplate(child)) {
      walkHtmlElements(child.content, visit);
    }
    walkHtmlElements(child, visit);
  }
}

export function readAttribute(element: Element, name: string): string | null {
  const lowered = name.toLowerCase();
  const found = element.attrs.find((attribute) => attribute.name.toLowerCase() === lowered);
  if (found === undefined) {
    return null;
  }
  const trimmed = found.value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function elementText(element: Element): string {
  return collectText(element).replaceAll(/\s+/gu, ' ').trim();
}

function collectText(node: Node): string {
  if (node.nodeName === '#text' && 'value' in node) {
    return node.value;
  }
  if (!('childNodes' in node)) {
    return '';
  }
  return node.childNodes.map((child) => collectText(child)).join('');
}

function isElement(node: Node): node is Element {
  return 'tagName' in node && 'attrs' in node;
}

function isTemplate(element: Element): element is Template {
  return element.tagName === 'template' && 'content' in element;
}
