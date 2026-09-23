import { describe, expect, it } from 'vitest';
import { pageSnapshot } from '../testing/page-snapshot.js';
import { checkTitle } from './title.js';

describe('SC005 title', () => {
  it('warns when the target title is missing or empty and records a change as info', () => {
    const missing = checkTitle({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        title: 'Old title',
      }),
      target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
    });
    expect(missing[0]).toMatchObject({
      ruleId: 'SC005',
      severity: 'warning',
      sourceValue: 'Old title',
      targetValue: null,
    });

    const empty = checkTitle({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        title: 'Old title',
      }),
      target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/', title: '' }),
    });
    expect(empty[0]?.severity).toBe('warning');
    expect(empty[0]?.message).toContain('empty');

    const changed = checkTitle({
      path: '/company/',
      source: pageSnapshot({
        requestedUrl: 'https://old.example.com/company/',
        title: 'Old title',
      }),
      target: pageSnapshot({
        requestedUrl: 'https://new.example.net/company/',
        title: 'New title',
      }),
    });
    expect(changed[0]).toMatchObject({
      severity: 'info',
      sourceValue: 'Old title',
      targetValue: 'New title',
    });
  });

  it('does not report unchanged or absent titles', () => {
    expect(
      checkTitle({
        path: '/company/',
        source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/', title: 'Same' }),
        target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/', title: 'Same' }),
      }),
    ).toEqual([]);
    expect(
      checkTitle({
        path: '/company/',
        source: pageSnapshot({ requestedUrl: 'https://old.example.com/company/' }),
        target: pageSnapshot({ requestedUrl: 'https://new.example.net/company/' }),
      }),
    ).toEqual([]);
  });
});
