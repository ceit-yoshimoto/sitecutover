import type { PageSnapshot } from '../model/page.js';

export function isHtmlDocument(snapshot: PageSnapshot): boolean {
  if (snapshot.contentType === null) {
    return true;
  }
  const mime = snapshot.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime === 'text/html' || mime === 'application/xhtml+xml';
}
