import type { Doc } from '../model';
import type { Player, Scheduler } from '../player';
import type { Settings } from '../settings';
import type { Timeline } from '../timeline';
import type { SpeechDriver } from '../tts';
import type { Build } from './dom';
import type { Host } from './host';

/** What every zone of a mounted reader shares. */
export interface ReaderContext {
  readonly doc: Doc;
  readonly host: Host;
  readonly player: Player;
  /** The timeline the player currently runs (rebuilt when settings change). */
  readonly timeline: Timeline;
  readonly settings: Settings;
  readonly document: Document;
  readonly h: Build;
  /** The focus root of the reader. */
  readonly reader: HTMLElement;
  /** The player's timers and clock. */
  readonly scheduler: Scheduler;
  /** Animation frames (the dial's coast); tests fake them. */
  readonly frame: FrameSource;
  /** Text-to-speech (unavailable when the host has no Web Speech API). */
  readonly speech: SpeechDriver;
  /** Settings only this host uses, shown in the panel when declared (`MountOptions.hostSettings`). */
  readonly hostSettings: readonly HostSetting[];
  /** Whether an input event may act: with `trustedEventsOnly`, only events from the user do. */
  accepts(event: Event): boolean;
}

/** A part of the reader UI. `refresh` runs after the timeline is rebuilt. */
export interface Zone {
  refresh?(): void;
  destroy(): void;
}

/** A frame callback source: the window's animation frames by default. */
export interface FrameSource {
  request(fn: (time: number) => void): unknown;
  cancel(handle: unknown): void;
}

/** A setting only some hosts use: `pageFade`, the browser overlay's page strength (R29), and `display`, the browser's overlay or side panel. */
export type HostSetting = 'pageFade' | 'display';
