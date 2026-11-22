import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '@speed-read/core';
import { extensionStore, MIGRATIONS_KEY, SETTINGS_KEY } from './storage';

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

  it('normalizes a bogus or legacy stored reading mode to flow', async () => {
    for (const stored of [{ readingMode: 'bogus' }, { wpm: 400 }]) {
      const area = { async get(key: string) { return { [key]: stored }; }, async set() {} };
      const loaded = await extensionStore(area as never).load();
      expect(normalizeSettings(loaded).readingMode).toBe('flow');
    }
  });

  describe('the flow-default migration', () => {
    function fakeArea(initial: Record<string, unknown>, failSets = 0) {
      const state = { stored: { ...initial } as Record<string, unknown>, failSets };
      const area = {
        async get(key: string) {
          return { [key]: state.stored[key] };
        },
        async set(value: Record<string, unknown>) {
          if (state.failSets-- > 0) throw new Error('quota');
          state.stored = { ...state.stored, ...value };
        },
      };
      return { state, area: area as never };
    }

    it('moves stored chunk settings to flow once, writing them back and recording the id', async () => {
      const { state, area } = fakeArea({ [SETTINGS_KEY]: { readingMode: 'chunk', wpm: 400 } });
      const loaded = await extensionStore(area).load();
      expect(loaded).toMatchObject({ readingMode: 'flow', wpm: 400 });
      expect(state.stored[SETTINGS_KEY]).toMatchObject({ readingMode: 'flow', wpm: 400 });
      expect(state.stored[MIGRATIONS_KEY]).toEqual(['flow-default']);
    });

    it('keeps a later choice of chunk', async () => {
      const { state, area } = fakeArea({ [SETTINGS_KEY]: { readingMode: 'chunk' } });
      const store = extensionStore(area);
      await store.load();
      await store.save({ ...DEFAULT_SETTINGS, readingMode: 'chunk' });
      expect((await store.load()).readingMode).toBe('chunk');
      expect(state.stored[MIGRATIONS_KEY]).toEqual(['flow-default']);
    });

    it('with no stored settings only records the id', async () => {
      const { state, area } = fakeArea({});
      expect(await extensionStore(area).load()).toEqual({});
      expect(state.stored[SETTINGS_KEY]).toBeUndefined();
      expect(state.stored[MIGRATIONS_KEY]).toEqual(['flow-default']);
    });

    it('leaves the id unrecorded when the write fails, and migrates on the next load', async () => {
      const { state, area } = fakeArea({ [SETTINGS_KEY]: { readingMode: 'chunk' } }, 1);
      const store = extensionStore(area);
      expect((await store.load()).readingMode).toBe('flow');
      expect(state.stored[MIGRATIONS_KEY]).toBeUndefined();
      expect((await store.load()).readingMode).toBe('flow');
      expect(state.stored[SETTINGS_KEY]).toMatchObject({ readingMode: 'flow' });
      expect(state.stored[MIGRATIONS_KEY]).toEqual(['flow-default']);
    });

    it('records the id when saving, so a chosen chunk survives a failed migration write (p1-r5)', async () => {
      const { state, area } = fakeArea({ [SETTINGS_KEY]: { readingMode: 'chunk' }, [MIGRATIONS_KEY]: ['other'] }, 1);
      const store = extensionStore(area);
      await store.load(); // the write fails: the id stays unrecorded
      await store.save({ ...DEFAULT_SETTINGS, readingMode: 'chunk' });
      expect(state.stored[MIGRATIONS_KEY]).toEqual(['other', 'flow-default']);
      expect((await store.load()).readingMode).toBe('chunk');
    });

    it('does not touch settings once the id is recorded', async () => {
      const { area } = fakeArea({ [SETTINGS_KEY]: { readingMode: 'chunk' }, [MIGRATIONS_KEY]: ['flow-default'] });
      expect((await extensionStore(area).load()).readingMode).toBe('chunk');
    });
  });
});
