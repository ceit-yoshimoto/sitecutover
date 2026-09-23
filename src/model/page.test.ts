import { describe, expect, it } from 'vitest';
import { serializeJson } from './json.js';
import { copyPagePair, copyPageSnapshot, type PageSnapshot } from './page.js';

const snapshot: PageSnapshot = {
  requestedUrl: 'https://old.example.com/company/',
  finalUrl: 'https://old.example.com/about/',
  status: 200,
  redirectHops: [{ url: 'https://old.example.com/company/', status: 301 }],
  contentType: 'text/html; charset=utf-8',
  xRobotsTag: null,
  internalLinks: ['https://old.example.com/about/', 'https://old.example.com/contact/'],
  title: 'Company',
  metaDescription: null,
  canonical: 'https://old.example.com/about/',
  metaRobots: 'index,follow',
  fetchError: null,
  redirectLoop: false,
  redirectHopLimitExceeded: false,
  crossOriginRedirectStopped: false,
};

describe('page snapshot', () => {
  it('serializes fetch metadata without a response body', () => {
    const raw = {
      ...snapshot,
      body: '<html>secret</html>',
      authorization: 'Bearer secret-token',
    };

    expect(serializeJson(copyPageSnapshot(raw as PageSnapshot))).toBe(`{
  "canonical": "https://old.example.com/about/",
  "contentType": "text/html; charset=utf-8",
  "crossOriginRedirectStopped": false,
  "fetchError": null,
  "finalUrl": "https://old.example.com/about/",
  "internalLinks": [
    "https://old.example.com/about/",
    "https://old.example.com/contact/"
  ],
  "metaDescription": null,
  "metaRobots": "index,follow",
  "redirectHopLimitExceeded": false,
  "redirectHops": [
    {
      "status": 301,
      "url": "https://old.example.com/company/"
    }
  ],
  "redirectLoop": false,
  "requestedUrl": "https://old.example.com/company/",
  "status": 200,
  "title": "Company",
  "xRobotsTag": null
}
`);
  });

  it('keeps a fetch error as code and message', () => {
    const copied = copyPageSnapshot({
      ...snapshot,
      status: null,
      redirectHops: [],
      title: null,
      canonical: null,
      metaRobots: null,
      fetchError: {
        code: 'TIMEOUT',
        message: 'The request timed out',
      },
    });

    expect(copied.fetchError).toEqual({
      code: 'TIMEOUT',
      message: 'The request timed out',
    });
    expect(serializeJson(copied)).not.toContain('stack');
  });

  it('represents a source-only page pair', () => {
    const pair = copyPagePair({
      path: '/company/',
      source: snapshot,
      target: null,
    });

    expect(pair.target).toBeNull();
    expect(serializeJson(pair)).toContain('"target": null');
    expect(serializeJson(pair)).toContain('"path": "/company/"');
  });

  it('keeps a blank title distinct from a missing title', () => {
    expect(copyPageSnapshot({ ...snapshot, title: '' }).title).toBe('');
    expect(copyPageSnapshot({ ...snapshot, title: null }).title).toBeNull();
  });
});
