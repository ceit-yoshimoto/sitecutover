export function isHtmlMime(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime === 'text/html' || mime === 'application/xhtml+xml';
}
