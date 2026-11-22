import type { Settings, SettingsStore } from '@speed-read/core';
import type { ExtApi } from './ext';

export const SETTINGS_KEY = 'settings';
/** Ids of the one-time settings migrations already applied; it lives beside the settings, outside `Settings`. */
export const MIGRATIONS_KEY = 'migrations';
const FLOW_DEFAULT = 'flow-default';

/** Reader settings in `storage.local` (spec section 7 Storage). */
export function extensionStore(area: ExtApi['storage']['local']): SettingsStore {
  /** The flow-default migration (spec 2026-11-22-flow-default-ux R2): once, stored settings move to flow. */
  async function migrate(stored: Partial<Settings> | null): Promise<Partial<Settings>> {
    const applied = (await area.get(MIGRATIONS_KEY))?.[MIGRATIONS_KEY];
    const ids = Array.isArray(applied) ? (applied as string[]) : [];
    if (ids.includes(FLOW_DEFAULT)) return stored ?? {};
    const migrated = stored ? { ...stored, readingMode: 'flow' as const } : null;
    try {
      // A failed write leaves the id unrecorded, so the next load tries again.
      await area.set({ ...(migrated ? { [SETTINGS_KEY]: migrated } : {}), [MIGRATIONS_KEY]: [...ids, FLOW_DEFAULT] });
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
      // Saving is the user's own choice: it also records the migration, so a failed migration write cannot
      // force flow again over a chunk they picked afterwards.
      const applied = (await area.get(MIGRATIONS_KEY))?.[MIGRATIONS_KEY];
      const ids = Array.isArray(applied) ? (applied as string[]) : [];
      await area.set({ [SETTINGS_KEY]: settings, [MIGRATIONS_KEY]: ids.includes(FLOW_DEFAULT) ? ids : [...ids, FLOW_DEFAULT] });
    },
  };
}
