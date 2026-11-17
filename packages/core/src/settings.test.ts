import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';

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
  });
});
