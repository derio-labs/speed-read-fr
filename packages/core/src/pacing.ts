import type { Settings } from './settings';
import type { Step } from './timeline';

export const TITLE_MS = 1200;
export const ITEM_GAP_MS = 400;
export const LIST_WHOLE_MIN_MS = 1500;
/** What a stop or chapter step counts for in a section estimate. */
export const STOP_ESTIMATE_MS = 3000;

const CLAUSE_END_FACTOR = 0.5;
const SENTENCE_END_FACTOR = 1.2;
const LONG_TOKEN_FACTOR = 0.3;
const LONG_TOKEN_CHARS = 8;
const LIST_WHOLE_FACTOR = 1.5;
const RAMP = [0.6, 0.68, 0.76, 0.84, 0.92, 1];

/** Milliseconds per word at the set speed. */
export const baseMs = (settings: Pick<Settings, 'wpm'>) => 60000 / settings.wpm;

/** Whether a step runs at the ramped rate and takes a ramp slot. */
export const isRamped = (step: Step): boolean => step.kind === 'chunk' || step.kind === 'item-chunk';

/** Unramped duration of a step in ms; null for steps that wait for the reader (stop, chapter). */
export function stepDuration(step: Step, settings: Settings): number | null {
  const base = baseMs(settings);
  switch (step.kind) {
    case 'chunk':
    case 'item-chunk': {
      const { tokens, endsClause, endsSentence } = step.chunk;
      const longTokens = tokens.filter((t) => t.text.length > LONG_TOKEN_CHARS).length;
      return (
        base * tokens.length +
        (endsClause ? CLAUSE_END_FACTOR * base : 0) +
        (endsSentence ? SENTENCE_END_FACTOR * base : 0) +
        LONG_TOKEN_FACTOR * base * longTokens
      );
    }
    case 'title':
      return TITLE_MS;
    case 'item-gap':
      return ITEM_GAP_MS;
    case 'list-whole':
      return Math.max(LIST_WHOLE_MIN_MS, step.words * base * LIST_WHOLE_FACTOR);
    case 'dwell':
      return step.seconds * 1000;
    case 'stop':
    case 'chapter':
      return null;
  }
}

/** Speed factor for the n-th ramped step after a restart (duration is divided by it). */
export const rampFactor = (n: number): number => RAMP[Math.min(Math.max(n, 0), RAMP.length - 1)];

/** Estimated reading time of a run of steps in ms, without the ramp. */
export function sectionEstimate(steps: Step[], settings: Settings): number {
  return steps.reduce((total, step) => total + (stepDuration(step, settings) ?? STOP_ESTIMATE_MS), 0);
}
