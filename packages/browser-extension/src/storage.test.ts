import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '@speed-read/core';
import { extensionStore, SETTINGS_KEY } from './storage';

describe('extension settings persistence', () => {
  it('round-trips the selected reading mode through the host settings key', async () => {
    let stored: Record<string, unknown> = {};
    const area = {
      async get(key: string) {
        return { [key]: stored[key] };
      },
      async set(value: Record<string, unknown>) {
        stored = { ...stored, ...value };
      },
    };
    const store = extensionStore(area as never);
    await store.save({ ...DEFAULT_SETTINGS, readingMode: 'flow' });
    expect(stored[SETTINGS_KEY]).toMatchObject({ readingMode: 'flow' });
    expect((await store.load()).readingMode).toBe('flow');
  });

  it('normalizes a bogus or legacy stored reading mode to chunk', async () => {
    for (const stored of [{ readingMode: 'bogus' }, { wpm: 400 }]) {
      const area = { async get(key: string) { return { [key]: stored }; }, async set() {} };
      const loaded = await extensionStore(area as never).load();
      expect(normalizeSettings(loaded).readingMode).toBe('chunk');
    }
  });
});
