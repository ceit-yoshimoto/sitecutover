import { AuditModelError } from '../model/errors.js';
import { VERSION } from '../cli/version.js';

export function createUserAgent(version: string = VERSION): string {
  const trimmed = version.trim();
  if (trimmed.length === 0 || /[\r\n]/.test(trimmed)) {
    throw new AuditModelError('user agent version must be a single-line non-empty string');
  }
  return `sitecutover/${trimmed}`;
}
