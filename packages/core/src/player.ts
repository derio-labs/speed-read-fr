import type { SourceRef } from './model';
import { isRamped, rampFactor, stepDuration } from './pacing';
import type { Settings } from './settings';
import type { Step, StepPosition, Timeline, TimelineExhibit } from './timeline';

/** Timer functions the player runs on; tests inject a fake clock. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export type PlayerState = 'idle' | 'playing' | 'paused' | 'stopped' | 'reading' | 'closed';

/** Shown when playback runs past the last step. */
export interface EndStep {
  kind: 'end';
  words: number;
  elapsedMs: number;
}

export interface StepEvent {
  step: Step | EndStep;
  /** Index of the step in the timeline; the timeline length for the end step. */
  index: number;
  /** Scheduled (ramped) duration in ms; null when the step waits for the reader. */
  durationMs: number | null;
}

export interface PositionEvent extends StepPosition {
  index: number;
}

export interface PlayerEvents {
  step: StepEvent;
  state: PlayerState;
  position: PositionEvent;
  settings: Settings;
  /** E on an exhibit step: the exhibit to show expanded. */
  expand: StepPosition;
}

export interface Player {
  readonly state: PlayerState;
  readonly index: number;
  readonly settings: Settings;
  on<E extends keyof PlayerEvents>(event: E, fn: (payload: PlayerEvents[E]) => void): () => void;
  toggle(): void;
  continue(): void;
  sentence(delta: 1 | -1): void;
  section(delta: 1 | -1): void;
  jumpToSection(id: string): void;
  jumpToBlock(ref: SourceRef): void;
  speed(delta: number): void;
  toggleReading(): void;
  expand(): void;
  close(): void;
  revealedExhibits(sectionId: string): TimelineExhibit[];
}

const MIN_WPM = 100;
const MAX_WPM = 1000;

const waitsForReader = (step: Step) => step.kind === 'stop' || step.kind === 'chapter';

/** A sentence move lands on the first chunk of a sentence or on any non-chunk step but an item gap. */
const isLanding = (step: Step) =>
  step.kind === 'chunk' || step.kind === 'item-chunk' ? step.sentenceStart : step.kind !== 'item-gap';

const stepWords = (step: Step) =>
  step.kind === 'chunk' || step.kind === 'item-chunk'
    ? step.chunk.tokens.length
    : step.kind === 'list-whole'
      ? step.words
      : 0;

function sourceMatches(ref: SourceRef, source: SourceRef): boolean {
  if (ref === source) return true;
  const target = ref.element;
  const el = source.element;
  if (!target || !el) return false;
  return target === el || (typeof target.contains === 'function' && target.contains(el));
}

/** The state machine over a timeline (spec section 5). */
export function createPlayer(timeline: Timeline, initialSettings: Settings, scheduler: Scheduler): Player {
  const { steps, sections } = timeline;
  type Listener = (payload: PlayerEvents[keyof PlayerEvents]) => void;
  const listeners = new Map<keyof PlayerEvents, Set<Listener>>();
  let state: PlayerState = 'idle';
  let settings = initialSettings;
  let index = 0;
  let lastPosition = -1;
  let timer: unknown = null;
  let rampSlot = 0;
  let startedAt = 0;
  let visited = new Set<number>();
  /** Per section, the furthest step index reached while in it (Infinity once read to its end). */
  const reached = new Map<string, number>();

  function emit<E extends keyof PlayerEvents>(event: E, payload: PlayerEvents[E]) {
    listeners.get(event)?.forEach((fn) => fn(payload));
  }

  function setState(next: PlayerState) {
    if (state === next) return;
    state = next;
    emit('state', next);
  }

  function cancelTimer() {
    if (timer !== null) scheduler.clearTimeout(timer);
    timer = null;
  }

  function markReached(sectionId: string, at: number) {
    reached.set(sectionId, Math.max(reached.get(sectionId) ?? -1, at));
  }

  function finish() {
    cancelTimer();
    index = steps.length;
    const words = [...visited].reduce((n, i) => n + stepWords(steps[i]), 0);
    emit('step', { step: { kind: 'end', words, elapsedMs: scheduler.now() - startedAt }, index, durationMs: null });
    setState('idle');
  }

  /** Display step `at`; with `timed`, play it (scheduling the next step, or waiting at a stop). */
  function show(at: number, timed: boolean) {
    cancelTimer();
    if (at >= steps.length) return finish();
    index = at;
    const step = steps[at];
    visited.add(at);
    markReached(step.sectionId, at);
    if (lastPosition !== at) {
      lastPosition = at;
      emit('position', { sectionId: step.sectionId, blockIndex: step.blockIndex, source: step.source, index: at });
    }
    let durationMs = timed ? stepDuration(step, settings) : null;
    if (durationMs !== null && isRamped(step)) durationMs /= rampFactor(rampSlot++);
    if (timed) setState(waitsForReader(step) ? 'stopped' : 'playing');
    emit('step', { step, index: at, durationMs });
    if (durationMs !== null) timer = scheduler.setTimeout(() => advance(), durationMs);
  }

  /** Move on to the next step in reading order, marking a section read when leaving it. */
  function advance() {
    timer = null;
    const leaving = steps[index];
    const next = steps[index + 1];
    if (leaving && (!next || next.sectionId !== leaving.sectionId)) reached.set(leaving.sectionId, Infinity);
    show(index + 1, true);
  }

  function continueFromStop() {
    if (state !== 'stopped') return;
    rampSlot = 0;
    advance();
  }

  function play(at: number) {
    rampSlot = 0;
    show(at, true);
  }

  /** A navigation command: keep playing when playback was active, else show the target paused. */
  function moveTo(at: number) {
    if (state === 'closed' || at < 0 || at >= steps.length) return;
    if (state === 'playing' || state === 'stopped') return play(at);
    show(at, false);
    if (state !== 'reading') setState('paused');
  }

  /** Index in `sections` of the section holding step `at` (the last section at the end). */
  const sectionOf = (at: number) => sections.findIndex((s) => s.id === steps[Math.min(at, steps.length - 1)]?.sectionId);

  return {
    get state() {
      return state;
    },
    get index() {
      return index;
    },
    get settings() {
      return settings;
    },
    on(event, fn) {
      const set = listeners.get(event) ?? new Set<Listener>();
      listeners.set(event, set);
      const listener = fn as unknown as Listener;
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    toggle() {
      if (state === 'playing') {
        cancelTimer();
        setState('paused');
      } else if (state === 'stopped') {
        continueFromStop();
      } else if (state === 'paused') {
        play(index);
      } else if (state === 'idle') {
        if (index >= steps.length) index = 0;
        visited = new Set();
        startedAt = scheduler.now();
        play(index);
      }
    },
    continue: continueFromStop,
    sentence(delta) {
      if (state === 'closed' || steps.length === 0) return;
      let start = index;
      while (start > 0 && !isLanding(steps[start])) start--;
      if (delta < 0) {
        if (start === index && index > 0) {
          let prev = index - 1;
          while (prev > 0 && !isLanding(steps[prev])) prev--;
          start = prev;
        }
        return moveTo(start);
      }
      for (let next = index + 1; next < steps.length; next++) if (isLanding(steps[next])) return moveTo(next);
    },
    section(delta) {
      const target = sections[sectionOf(index) + delta];
      if (target) moveTo(target.firstStep);
    },
    jumpToSection(id) {
      const target = sections.find((s) => s.id === id);
      if (target) moveTo(target.firstStep);
    },
    jumpToBlock(ref) {
      const at = steps.findIndex((s) => sourceMatches(ref, s.source));
      if (at >= 0) moveTo(at);
    },
    speed(delta) {
      if (state === 'closed') return;
      const wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, settings.wpm + delta));
      if (wpm === settings.wpm) return;
      settings = { ...settings, wpm };
      emit('settings', settings);
    },
    toggleReading() {
      if (state === 'closed') return;
      if (state === 'reading') {
        rampSlot = 0;
        setState('paused');
      } else {
        cancelTimer();
        setState('reading');
      }
    },
    expand() {
      const step = steps[index];
      if (state === 'closed' || !step || (step.kind !== 'stop' && step.kind !== 'dwell')) return;
      if (state === 'playing') {
        cancelTimer();
        setState('paused');
      }
      emit('expand', { sectionId: step.sectionId, blockIndex: step.blockIndex, source: step.source });
    },
    close() {
      if (state === 'closed') return;
      cancelTimer();
      setState('closed');
    },
    revealedExhibits(sectionId) {
      const section = sections.find((s) => s.id === sectionId);
      const upTo = reached.get(sectionId) ?? -1;
      return section ? section.exhibits.filter((e) => e.revealAt <= upTo) : [];
    },
  };
}
