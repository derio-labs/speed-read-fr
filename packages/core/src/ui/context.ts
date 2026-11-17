import type { Doc } from '../model';
import type { Player } from '../player';
import type { Settings } from '../settings';
import type { Timeline } from '../timeline';
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
  /** Whether an input event may act: with `trustedEventsOnly`, only events from the user do. */
  accepts(event: Event): boolean;
}

/** A part of the reader UI. `refresh` runs after the timeline is rebuilt. */
export interface Zone {
  refresh?(): void;
  destroy(): void;
}
