import type { PageSnapshot } from '../model/page.js';
import { isHtmlMime } from '../parse/html-mime.js';

export function isHtmlDocument(snapshot: PageSnapshot): boolean {
  return isHtmlMime(snapshot.contentType);
}

/** A target response finished as comparable content, before the HTML check. */
export function isSuccessfulTargetResponse(snapshot: PageSnapshot): boolean {
  return (
    snapshot.fetchError === null &&
    !snapshot.redirectLoop &&
    !snapshot.redirectHopLimitExceeded &&
    !snapshot.crossOriginRedirectStopped &&
    isSuccessStatus(snapshot.status)
  );
}

/** SC003–SC006 inspect only this kind of target page. */
export function isUsableTargetHtml(snapshot: PageSnapshot): boolean {
  return isSuccessfulTargetResponse(snapshot) && isHtmlDocument(snapshot);
}

function isSuccessStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}
