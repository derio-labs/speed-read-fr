import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, memoryStore, normalizeSettings } from './settings';

describe('DEFAULT_SETTINGS', () => {
  it('has the pacing defaults', () => {
    expect(DEFAULT_SETTINGS.wpm).toBe(300);
    expect(DEFAULT_SETTINGS.chunkWords).toBe(3);
    expect(DEFAULT_SETTINGS.chunkChars).toBe(20);
  });

  it('has every other default of R12', () => {
    expect(DEFAULT_SETTINGS.stopLevels).toEqual([1, 2]);
    expect(DEFAULT_SETTINGS.code).toEqual({ mode: 'stop', dwellSeconds: 5 });
    expect(DEFAULT_SETTINGS.table).toEqual({ mode: 'stop', dwellSeconds: 5 });
    expect(DEFAULT_SETTINGS.math).toEqual({ mode: 'stop', dwellSeconds: 5 });
    expect(DEFAULT_SETTINGS.imageDwellSeconds).toBe(3);
    expect(DEFAULT_SETTINGS.display).toBe('overlay');
    expect(DEFAULT_SETTINGS.tts).toEqual({ enabled: false, voiceURI: null });
    expect(DEFAULT_SETTINGS.readingMode).toBe('flow');
    expect(DEFAULT_SETTINGS.focusChars).toBe(20);
    expect(DEFAULT_SETTINGS.flowMotion).toBe('word');
    expect(DEFAULT_SETTINGS.redLetters).toBe(true);
  });
});

describe('normalizeSettings flowMotion', () => {
  it('defaults to word, keeps flowing, and reads an unknown value as word', () => {
    expect(normalizeSettings({}).flowMotion).toBe('word');
    expect(normalizeSettings({ flowMotion: 'flowing' }).flowMotion).toBe('flowing');
    expect(normalizeSettings({ flowMotion: 'sideways' as never }).flowMotion).toBe('word');
  });
});

describe('normalizeSettings redLetters', () => {
  it('defaults to true, keeps false, and reads a non-boolean as true', () => {
    expect(normalizeSettings({}).redLetters).toBe(true);
    expect(normalizeSettings({ redLetters: false }).redLetters).toBe(false);
    expect(normalizeSettings({ redLetters: 'no' as never }).redLetters).toBe(true);
  });
});

describe('normalizeSettings', () => {
  it('fills missing keys from the defaults', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ wpm: 450 })).toEqual({ ...DEFAULT_SETTINGS, wpm: 450 });
  });

  it('keeps chunk mode and normalizes missing or unknown reading modes to flow', () => {
    expect(normalizeSettings({ readingMode: 'flow' }).readingMode).toBe('flow');
    expect(normalizeSettings({}).readingMode).toBe('flow');
    expect(normalizeSettings({ readingMode: 'unknown' } as never).readingMode).toBe('flow');
  });

  it('clamps the focus span to 6-40 characters, defaulting a missing or unreadable one to 20', () => {
    expect(normalizeSettings({ focusChars: 3 }).focusChars).toBe(6);
    expect(normalizeSettings({ focusChars: 99 }).focusChars).toBe(40);
    expect(normalizeSettings({ focusChars: 12 }).focusChars).toBe(12);
    expect(normalizeSettings({}).focusChars).toBe(20);
    expect(normalizeSettings({ focusChars: 'x' } as never).focusChars).toBe(20);
  });

  it('drops unknown keys', () => {
    const out = normalizeSettings({ wpm: 300, bogus: 1 } as never);
    expect(Object.keys(out).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    const code = normalizeSettings({ code: { mode: 'dwell', dwellSeconds: 4, extra: true } } as never).code;
    expect(code).toEqual({ mode: 'dwell', dwellSeconds: 4 });
  });

  it('clamps wpm to 100-1000', () => {
    expect(normalizeSettings({ wpm: 50 }).wpm).toBe(100);
    expect(normalizeSettings({ wpm: 5000 }).wpm).toBe(1000);
    expect(normalizeSettings({ wpm: 625 }).wpm).toBe(625);
  });

  it('clamps chunkWords to 1-10 and chunkChars to 5-80', () => {
    expect(normalizeSettings({ chunkWords: 0 }).chunkWords).toBe(1);
    expect(normalizeSettings({ chunkWords: 11 }).chunkWords).toBe(10);
    expect(normalizeSettings({ chunkChars: 2 }).chunkChars).toBe(5);
    expect(normalizeSettings({ chunkChars: 200 }).chunkChars).toBe(80);
  });

  it('falls back to the default for non-numeric values', () => {
    expect(normalizeSettings({ wpm: 'fast' } as never).wpm).toBe(300);
    expect(normalizeSettings({ chunkWords: Number.NaN }).chunkWords).toBe(3);
  });

  it('filters stopLevels to integers 1-6 and de-duplicates them', () => {
    expect(normalizeSettings({ stopLevels: [0, 1, 1, 2.5, 3, 7, 6, 3] }).stopLevels).toEqual([1, 3, 6]);
    expect(normalizeSettings({ stopLevels: [] }).stopLevels).toEqual([]);
  });

  it('falls back to the default mode outside stop|skip|dwell', () => {
    expect(normalizeSettings({ table: { mode: 'explode', dwellSeconds: 5 } } as never).table.mode).toBe('stop');
    expect(normalizeSettings({ math: { mode: 'skip', dwellSeconds: 5 } }).math.mode).toBe('skip');
  });

  it('clamps dwell seconds to 1-60', () => {
    expect(normalizeSettings({ code: { mode: 'dwell', dwellSeconds: 0 } }).code.dwellSeconds).toBe(1);
    expect(normalizeSettings({ code: { mode: 'dwell', dwellSeconds: 99 } }).code.dwellSeconds).toBe(60);
    expect(normalizeSettings({ imageDwellSeconds: 0 }).imageDwellSeconds).toBe(1);
    expect(normalizeSettings({ imageDwellSeconds: 120 }).imageDwellSeconds).toBe(60);
  });

  it('keeps a valid display and tts, and defaults invalid ones', () => {
    expect(normalizeSettings({ display: 'dock' }).display).toBe('dock');
    expect(normalizeSettings({ display: 'popup' } as never).display).toBe('overlay');
    expect(normalizeSettings({ tts: { enabled: true, voiceURI: 'v1' } }).tts).toEqual({ enabled: true, voiceURI: 'v1' });
    expect(normalizeSettings({ tts: { enabled: 'yes', voiceURI: 3 } } as never).tts).toEqual({ enabled: false, voiceURI: null });
  });
});

describe('memoryStore', () => {
  it('saves and loads settings', async () => {
    const store = memoryStore();
    expect(await store.load()).toEqual({});
    await store.save({ ...DEFAULT_SETTINGS, wpm: 400 });
    expect((await store.load()).wpm).toBe(400);
  });
});

describe('pageFade (R29)', () => {
  it('defaults to 0.32 and is clamped to 0.10-0.80', () => {
    expect(DEFAULT_SETTINGS.pageFade).toBe(0.32);
    expect(normalizeSettings({ pageFade: 0.01 }).pageFade).toBe(0.1);
    expect(normalizeSettings({ pageFade: 0.95 }).pageFade).toBe(0.8);
    expect(normalizeSettings({ pageFade: 0.5 }).pageFade).toBe(0.5);
    expect(normalizeSettings({ pageFade: 'x' as never }).pageFade).toBe(0.32);
  });
});
