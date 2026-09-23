import type { PageSnapshot } from '../model/page.js';
import { isHtmlMime } from '../parse/html-mime.js';

export function isHtmlDocument(snapshot: PageSnapshot): boolean {
  return isHtmlMime(snapshot.contentType);
}
