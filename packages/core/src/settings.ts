export type ExhibitMode = 'stop' | 'skip' | 'dwell';

export interface ExhibitBehaviour {
  mode: ExhibitMode;
  dwellSeconds: number;
}

export type DisplayMode = 'overlay' | 'dock';

export interface TtsSettings {
  enabled: boolean;
  voiceURI: string | null;
}

export interface Settings {
  wpm: number;
  chunkWords: number;
  chunkChars: number;
  stopLevels: number[];
  code: ExhibitBehaviour;
  table: ExhibitBehaviour;
  math: ExhibitBehaviour;
  imageDwellSeconds: number;
  display: DisplayMode;
  tts: TtsSettings;
  /** Strength of the page behind the browser's floating reader, 0.10-0.80 (R29); other hosts ignore it. */
  pageFade: number;
}

export const DEFAULT_SETTINGS: Settings = {
  wpm: 300,
  chunkWords: 3,
  chunkChars: 20,
  stopLevels: [1, 2],
  code: { mode: 'stop', dwellSeconds: 5 },
  table: { mode: 'stop', dwellSeconds: 5 },
  math: { mode: 'stop', dwellSeconds: 5 },
  imageDwellSeconds: 3,
  display: 'overlay',
  tts: { enabled: false, voiceURI: null },
  pageFade: 0.32,
};

export interface SettingsStore {
  load(): Promise<Partial<Settings>>;
  save(settings: Settings): Promise<void>;
}

const EXHIBIT_MODES: readonly ExhibitMode[] = ['stop', 'skip', 'dwell'];
const DISPLAY_MODES: readonly DisplayMode[] = ['overlay', 'dock'];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeExhibit(value: unknown, fallback: ExhibitBehaviour): ExhibitBehaviour {
  const v = (value ?? {}) as Partial<Record<keyof ExhibitBehaviour, unknown>>;
  return {
    mode: oneOf(v.mode, EXHIBIT_MODES, fallback.mode),
    dwellSeconds: clampNumber(v.dwellSeconds, 1, 60, fallback.dwellSeconds),
  };
}

function normalizeStopLevels(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.stopLevels];
  const levels: number[] = [];
  for (const level of value) {
    if (Number.isInteger(level) && level >= 1 && level <= 6 && !levels.includes(level)) levels.push(level);
  }
  return levels;
}

function normalizeTts(value: unknown): TtsSettings {
  const v = (value ?? {}) as Partial<Record<keyof TtsSettings, unknown>>;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_SETTINGS.tts.enabled,
    voiceURI: typeof v.voiceURI === 'string' ? v.voiceURI : DEFAULT_SETTINGS.tts.voiceURI,
  };
}

/** A complete, valid `Settings` from any partial input: unknown keys dropped, values clamped, gaps defaulted. */
export function normalizeSettings(partial: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS;
  const p = (partial ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    wpm: clampNumber(p.wpm, 100, 1000, d.wpm),
    chunkWords: clampNumber(p.chunkWords, 1, 10, d.chunkWords),
    chunkChars: clampNumber(p.chunkChars, 5, 80, d.chunkChars),
    stopLevels: normalizeStopLevels(p.stopLevels),
    code: normalizeExhibit(p.code, d.code),
    table: normalizeExhibit(p.table, d.table),
    math: normalizeExhibit(p.math, d.math),
    imageDwellSeconds: clampNumber(p.imageDwellSeconds, 1, 60, d.imageDwellSeconds),
    display: oneOf(p.display, DISPLAY_MODES, d.display),
    tts: normalizeTts(p.tts),
    pageFade: clampNumber(p.pageFade, 0.1, 0.8, d.pageFade),
  };
}

/** An in-memory `SettingsStore`, for tests and hosts without persistence. */
export function memoryStore(initial: Partial<Settings> = {}): SettingsStore {
  let saved: Partial<Settings> = structuredClone(initial);
  return {
    async load() {
      return structuredClone(saved);
    },
    async save(settings) {
      saved = structuredClone(settings);
    },
  };
}
