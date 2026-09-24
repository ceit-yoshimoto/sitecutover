import { describe, expect, it } from 'vitest';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkIndexingDirectives } from './robots.js';

describe('SC004 indexing-directives', () => {
  it('reports a target noindex regression from meta robots or X-Robots-Tag', () => {
    const meta = checkIndexingDirectives({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        metaRobots: 'index, follow',
      }),
      target: pageSnapshot({
        requestedUrl: 'https://new.example.net/company/',
        metaRobots: 'noindex, follow',
      }),
    });
    expect(meta[0]).toMatchObject({ ruleId: 'SC004', severity: 'error' });

    const header = checkIndexingDirectives({
      path: '/company/',
      source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/' }),
      target: pageSnapshot({
        requestedUrl: 'https://new.example.net/company/',
        xRobotsTag: 'none',
      }),
    });
    expect(header[0]?.severity).toBe('error');
    expect(header[0]?.targetValue).toMatchObject({ xRobotsTag: 'none' });
  });

  it('warns for other directive changes and ignores an existing noindex', () => {
    const changed = checkIndexingDirectives({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        metaRobots: 'index, follow',
      }),
      target: pageSnapshot({
        requestedUrl: 'https://new.example.net/company/',
        metaRobots: 'index, nofollow',
      }),
    });
    expect(changed).toMatchObject([{ ruleId: 'SC004', severity: 'warning' }]);

    expect(
      checkIndexingDirectives({
        path: '/company/',
        source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/' }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          metaRobots: 'index, follow',
        }),
      }),
    ).toEqual([]);
    expect(
      checkIndexingDirectives({
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          metaRobots: 'all',
        }),
        target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
      }),
    ).toEqual([]);
    expect(
      checkIndexingDirectives({
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          metaRobots: 'max-image-preview:large',
        }),
        target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
      }),
    ).toMatchObject([{ ruleId: 'SC004', severity: 'warning' }]);

    expect(
      checkIndexingDirectives({
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          metaRobots: 'noindex',
        }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          xRobotsTag: 'noindex',
        }),
      }),
    ).toEqual([]);
  });
});
