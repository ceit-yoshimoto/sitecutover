import { describe, expect, it } from 'vitest';
import { resolveRedirectLocation } from './redirect-trace.js';

describe('resolveRedirectLocation', () => {
  it('resolves a relative Location against the current URL', () => {
    const resolved = resolveRedirectLocation('http://127.0.0.1:9/start', '/landed');
    expect('url' in resolved && resolved.url.href).toBe('http://127.0.0.1:9/landed');
  });

  it('rejects credentials and non-http protocols without echoing the Location', () => {
    const credentials = resolveRedirectLocation(
      'http://127.0.0.1:9/start',
      'http://user:secret-password@127.0.0.1/next',
    );
    const script = resolveRedirectLocation('http://127.0.0.1:9/start', 'javascript:alert(1)');

    expect(credentials).toEqual({
      error: {
        code: 'CREDENTIALS_IN_URL',
        message: 'Redirect Location must not include credentials',
      },
    });
    expect(JSON.stringify(credentials)).not.toContain('secret-password');
    expect(script).toMatchObject({ error: { code: 'UNSUPPORTED_PROTOCOL' } });
  });
});
