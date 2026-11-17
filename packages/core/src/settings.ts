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
};
