import type { Settings, SettingsStore } from '@speed-read/core';
import type { ExtApi } from './ext';

export const SETTINGS_KEY = 'settings';

/** Reader settings in `storage.local` (spec section 7 Storage). */
export function extensionStore(area: ExtApi['storage']['local']): SettingsStore {
  return {
    async load() {
      try {
        const value = (await area.get(SETTINGS_KEY))?.[SETTINGS_KEY];
        return value && typeof value === 'object' ? (value as Partial<Settings>) : {};
      } catch {
        return {};
      }
    },
    async save(settings) {
      await area.set({ [SETTINGS_KEY]: settings });
    },
  };
}
