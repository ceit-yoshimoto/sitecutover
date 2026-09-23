import { describe, expect, it } from 'vitest';
import { VERSION } from '../cli/version.js';
import { AuditModelError } from '../model/errors.js';
import { createUserAgent } from './user-agent.js';

describe('createUserAgent', () => {
  it('uses the package version by default', () => {
    expect(createUserAgent()).toBe(`sitecutover/${VERSION}`);
  });

  it('rejects header injection', () => {
    expect(() => createUserAgent('1\r\nX-Evil: 1')).toThrow(AuditModelError);
  });
});
