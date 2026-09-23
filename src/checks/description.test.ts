import { describe, expect, it } from 'vitest';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkDescription } from './description.js';

describe('SC006 meta-description', () => {
  it('warns when the target description is missing and records a change as info', () => {
    const missing = checkDescription({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        metaDescription: 'Old description',
      }),
      target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
    });
    expect(missing[0]).toMatchObject({
      ruleId: 'SC006',
      severity: 'warning',
      sourceValue: 'Old description',
      targetValue: null,
    });

    const changed = checkDescription({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        metaDescription: 'Old description',
      }),
      target: pageSnapshot({
        requestedUrl: 'https://new.example.net/company/',
        metaDescription: 'New description',
      }),
    });
    expect(changed[0]).toMatchObject({
      severity: 'info',
      sourceValue: 'Old description',
      targetValue: 'New description',
    });
  });

  it('does not report unchanged or absent descriptions', () => {
    expect(
      checkDescription({
        path: '/company/',
        source: pageSnapshot({
          requestedUrl: 'https://old.example.com/company/',
          metaDescription: 'Same',
        }),
        target: pageSnapshot({
          requestedUrl: 'https://new.example.net/company/',
          metaDescription: 'Same',
        }),
      }),
    ).toEqual([]);
    expect(
      checkDescription({
        path: '/company/',
        source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/' }),
        target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
      }),
    ).toEqual([]);
  });
});
