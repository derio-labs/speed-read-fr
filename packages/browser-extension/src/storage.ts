import type { Settings, SettingsStore } from '@speed-read/core';
import type { ExtApi } from './ext';

export const SETTINGS_KEY = 'settings';
/** Ids of the one-time settings migrations already applied; it lives beside the settings, outside `Settings`. */
export const MIGRATIONS_KEY = 'migrations';

/**
 * The one-time settings migrations, in order. 'flow-default' (spec 2026-11-22-flow-default-ux R2) moves stored
 * settings to flow; 'word-motion-default' (spec 2026-11-26-word-default-red-toggle-top-dock R2) moves a stored
 * Flowing motion to Word by word.
 */
const MIGRATIONS: { id: string; apply(stored: Partial<Settings>): Partial<Settings> }[] = [
  { id: 'flow-default', apply: (stored) => ({ ...stored, readingMode: 'flow' }) },
  { id: 'word-motion-default', apply: (stored) => (stored.flowMotion === 'flowing' ? { ...stored, flowMotion: 'word' } : stored) },
];
const ALL_IDS = MIGRATIONS.map((m) => m.id);

/** Reader settings in `storage.local` (spec section 7 Storage). */
export function extensionStore(area: ExtApi['storage']['local']): SettingsStore {
  /** Ids of the migrations already applied; null when the record cannot be read. */
  async function appliedIds(): Promise<string[] | null> {
    try {
      const applied = (await area.get(MIGRATIONS_KEY))?.[MIGRATIONS_KEY];
      return Array.isArray(applied) ? (applied as string[]) : [];
    } catch {
      return null;
    }
  }
  /** Applies every migration not yet recorded, writing settings and record together; both ids land in one write. */
  async function migrate(stored: Partial<Settings> | null): Promise<Partial<Settings>> {
    const ids = await appliedIds();
    if (ids === null) return stored ?? {}; // The record is unreadable: keep the settings as stored.
    const pending = MIGRATIONS.filter((m) => !ids.includes(m.id));
    if (pending.length === 0) return stored ?? {};
    const migrated = stored ? pending.reduce((settings, m) => m.apply(settings), stored) : null;
    try {
      // A failed write leaves the ids unrecorded, so the next load tries again.
      await area.set({ ...(migrated ? { [SETTINGS_KEY]: migrated } : {}), [MIGRATIONS_KEY]: [...ids, ...pending.map((m) => m.id)] });
    } catch {
      // The migrated settings still apply to this load.
    }
    return migrated ?? {};
  }
  return {
    async load() {
      try {
        const value = (await area.get(SETTINGS_KEY))?.[SETTINGS_KEY];
        return await migrate(value && typeof value === 'object' ? (value as Partial<Settings>) : null);
      } catch {
        return {};
      }
    },
    async save(settings) {
      // Saving is the user's own choice: it also records every migration, so a failed migration write cannot
      // force flow or word by word again over a choice they made afterwards.
      const ids = (await appliedIds()) ?? [];
      await area.set({ [SETTINGS_KEY]: settings, [MIGRATIONS_KEY]: [...ids, ...ALL_IDS.filter((id) => !ids.includes(id))] });
    },
  };
}
