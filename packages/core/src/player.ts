import type { SourceRef, Token } from './model';
import { isRamped, rampFactor, stepDuration } from './pacing';
import type { Settings } from './settings';
import type { Step, StepPosition, Timeline, TimelineExhibit, TimelineSection } from './timeline';
import type { SpeechDriver } from './tts';

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
  /** Text-to-speech without word boundaries: show steps `from`..`to` (one sentence) whole until it ends. */
  whole: { from: number; to: number };
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
  setSpeed(wpm: number): void;
  toggleReading(): void;
  expand(): void;
  close(): void;
  revealedExhibits(sectionId: string): TimelineExhibit[];
  /**
   * The position dial: move by `steps` whole steps (negative is back), showing each landing without
   * holding on stops or chapter cards. Playback pauses; 700 ms after the last movement it resumes
   * with a fresh ramp if it was playing and the position is on a timed step. Returns the steps moved.
   */
  scrub(steps: number): number;
  /**
   * Swap in a timeline rebuilt with new settings, keeping the position (the same source when it
   * still exists, else the first step at or after the old block), the play state, the reading
   * session and what has been revealed.
   */
  replaceTimeline(timeline: Timeline, settings: Settings): void;
}

const MIN_WPM = 100;
/** Quiet time after the last dial movement before playback resumes (spec section 13). */
export const SCRUB_RESUME_MS = 700;
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

/** Identity of an exhibit across rebuilt timelines: its DOM element, else its block. */
const exhibitKey = (e: TimelineExhibit): unknown => e.block.source.element ?? e.block;

/** A title as spoken: its tokens without math (p5b-r8), else its words. */
const titleTokens = (step: Extract<Step, { kind: 'title' }>): Token[] =>
  step.tokens ?? step.text.split(/\s+/).filter(Boolean).map((text) => ({ kind: 'word' as const, text }));

type SpokenStep = Extract<Step, { kind: 'chunk' | 'item-chunk' }>;
const isSentencePart = (step: Step | undefined): step is SpokenStep => step?.kind === 'chunk' || step?.kind === 'item-chunk';
const sameSentence = (a: SpokenStep, b: Step | undefined) =>
  isSentencePart(b) && b.kind === a.kind && b.source === a.source && b.sentenceIndex === a.sentenceIndex;

/**
 * The state machine over a timeline (spec section 5). With `speech` and `settings.tts.enabled`,
 * prose sentences, list items and titles are timed by the speech driver instead of the pacing timer.
 */
export function createPlayer(initialTimeline: Timeline, initialSettings: Settings, scheduler: Scheduler, speech?: SpeechDriver): Player {
  type Listener = (payload: PlayerEvents[keyof PlayerEvents]) => void;
  const listeners = new Map<keyof PlayerEvents, Set<Listener>>();
  let steps: Step[] = [];
  let sections: TimelineSection[] = [];
  let state: PlayerState = 'idle';
  let settings = initialSettings;
  let index = 0;
  let lastPosition = -1;
  let timer: unknown = null;
  /** Bumped whenever pending work is cancelled; a timer or an emit loop from an older generation stops. */
  let generation = 0;
  let rampSlot = 0;
  /** True when the current stop was reached by playback, so navigation keeps playing. */
  let stopFromPlayback = false;
  /** An utterance is in flight (cancelled with the timer). */
  let speaking = false;
  /** Pending resume after scrubbing, and whether playback was on when the scrub began. */
  let resumeTimer: unknown = null;
  let scrubWasPlaying = false;

  // Reading session: from the first play after idle to the end.
  let sessionActive = false;
  let startedAt = 0;
  let visited = new Set<number>();
  let carriedWords = 0;

  // Exhibits are revealed once the reading position passes their reveal step, in timeline order.
  let byReveal: TimelineExhibit[] = [];
  let revealCursor = 0;
  const revealed = new Set<unknown>();

  function load(timeline: Timeline) {
    steps = timeline.steps;
    sections = timeline.sections;
    byReveal = sections.flatMap((s) => s.exhibits).sort((a, b) => a.revealAt - b.revealAt);
    revealCursor = 0;
  }
  load(initialTimeline);

  function emit<E extends keyof PlayerEvents>(event: E, payload: PlayerEvents[E]) {
    listeners.get(event)?.forEach((fn) => fn(payload));
  }

  function setState(next: PlayerState) {
    if (state === next) return;
    state = next;
    emit('state', next);
  }

  function cancelTimer() {
    generation++;
    if (timer !== null) scheduler.clearTimeout(timer);
    timer = null;
    if (resumeTimer !== null) scheduler.clearTimeout(resumeTimer);
    resumeTimer = null;
    if (speaking) {
      speaking = false;
      speech?.cancel();
    }
  }

  /** Speech times this step: tts is on, a voice is usable, and the step is prose, a list item or a title. */
  const speaks = (step: Step) =>
    !!speech?.available &&
    !speech.failed &&
    settings.tts.enabled &&
    speech.currentVoice() !== null &&
    (isSentencePart(step) || step.kind === 'title');
  /** A sentence the voice failed on: shown with timed chunks instead (p5b-r3). */
  let textOnly: { from: number; to: number } | null = null;

  /** A chunk reached by a speech boundary: shown without touching timers or speech. */
  function showSpoken(at: number) {
    index = at;
    visited.add(at);
    markPassed(at);
    const step = steps[at];
    if (lastPosition !== at) {
      lastPosition = at;
      emit('position', { sectionId: step.sectionId, blockIndex: step.blockIndex, source: step.source, index: at });
    }
    emit('step', { step, index: at, durationMs: null });
  }

  /** Speak from step `at` to the end of its sentence (or the title), then play on. */
  function startSpeech(at: number) {
    const gen = generation;
    const step = steps[at];
    let last = at;
    if (isSentencePart(step)) while (sameSentence(step, steps[last + 1])) last++;
    const chunks = isSentencePart(step)
      ? steps.slice(at, last + 1).map((s) => (s as SpokenStep).chunk)
      : [{ tokens: titleTokens(step as Extract<Step, { kind: 'title' }>) }];
    speaking = true;
    speech!.speak(chunks, settings.wpm, {
      onChunk(i) {
        if (gen === generation) showSpoken(at + i);
      },
      onWholeSentence() {
        if (gen === generation && last > at) emit('whole', { from: at, to: last });
      },
      onError() {
        if (gen !== generation) return;
        speaking = false;
        textOnly = { from: at, to: last };
        show(Math.max(at, index), true);
      },
      onEnd() {
        if (gen !== generation) return;
        speaking = false;
        for (let i = at; i <= last; i++) visited.add(i);
        index = last;
        advance();
      },
    });
  }

  const isTimed = (step: Step | undefined) => !!step && !waitsForReader(step) && stepDuration(step, settings) !== null;

  function scrub(delta: number): number {
    if (state === 'closed' || state === 'reading' || steps.length === 0 || !Number.isFinite(delta)) return 0;
    const whole = Math.trunc(delta);
    if (whole === 0 || (index >= steps.length && whole > 0)) return 0;
    const from = Math.min(index, steps.length);
    const to = Math.max(0, Math.min(steps.length - 1, from + whole));
    if (to === from) return 0;
    const wasPlaying = resumeTimer !== null ? scrubWasPlaying : state === 'playing' || (state === 'stopped' && stopFromPlayback);
    show(to, false);
    // A listener may have closed the player.
    if ((state as PlayerState) === 'closed') return 0;
    scrubWasPlaying = wasPlaying;
    resumeTimer = scheduler.setTimeout(() => {
      resumeTimer = null;
      if (scrubWasPlaying && isTimed(steps[index]) && (state === 'paused' || state === 'stopped')) play(index);
    }, SCRUB_RESUME_MS);
    return to - from;
  }

  function markPassed(at: number) {
    while (revealCursor < byReveal.length && byReveal[revealCursor].revealAt <= at) {
      revealed.add(exhibitKey(byReveal[revealCursor++]));
    }
  }

  function beginSession() {
    if (sessionActive) return;
    sessionActive = true;
    startedAt = scheduler.now();
    visited = new Set();
    carriedWords = 0;
  }

  const wordsRead = () => [...visited].reduce((n, i) => n + stepWords(steps[i]), carriedWords);

  function finish() {
    cancelTimer();
    const gen = generation;
    index = steps.length;
    markPassed(index);
    const end: EndStep = { kind: 'end', words: wordsRead(), elapsedMs: scheduler.now() - startedAt };
    sessionActive = false;
    const changed = state !== 'idle';
    state = 'idle';
    emit('step', { step: end, index, durationMs: null });
    if (changed && gen === generation) emit('state', 'idle');
  }

  /**
   * Display step `at`. With `timed`, play it: schedule the next step, or wait at a stop.
   * All state is settled and the timer scheduled before any listener runs; if a listener
   * changes the player, the remaining emits of this call are dropped.
   */
  function show(at: number, timed: boolean) {
    if (state === 'closed') return;
    if (at >= steps.length) return finish();
    cancelTimer();
    const gen = generation;
    index = at;
    const step = steps[at];
    if (timed) visited.add(at);
    markPassed(at);
    const positionChanged = lastPosition !== at;
    lastPosition = at;

    let durationMs: number | null = null;
    let next = state;
    const spoken = timed && speaks(step) && !(textOnly && at >= textOnly.from && at <= textOnly.to);
    if (spoken) {
      next = 'playing';
      stopFromPlayback = true;
    } else if (timed) {
      durationMs = stepDuration(step, settings);
      if (durationMs !== null && isRamped(step)) durationMs /= rampFactor(rampSlot++);
      next = waitsForReader(step) ? 'stopped' : 'playing';
      stopFromPlayback = true;
    } else if (state !== 'reading') {
      next = waitsForReader(step) ? 'stopped' : 'paused';
      stopFromPlayback = false;
    }
    const stateChanged = next !== state;
    state = next;
    if (durationMs !== null) {
      timer = scheduler.setTimeout(() => {
        if (gen === generation) advance();
      }, durationMs);
    }

    if (positionChanged) {
      emit('position', { sectionId: step.sectionId, blockIndex: step.blockIndex, source: step.source, index: at });
      if (gen !== generation) return;
    }
    if (stateChanged) {
      emit('state', next);
      if (gen !== generation) return;
    }
    emit('step', { step, index: at, durationMs });
    if (spoken && gen === generation) startSpeech(at);
  }

  function advance() {
    if (state === 'closed') return;
    timer = null;
    show(index + 1, true);
  }

  function play(at: number) {
    beginSession();
    rampSlot = 0;
    show(at, true);
  }

  function continueFromStop() {
    if (state !== 'stopped') return;
    beginSession();
    rampSlot = 0;
    advance();
  }

  /** A navigation command: keep playing when playback was active, else show the target paused. */
  function moveTo(at: number) {
    if (state === 'closed' || at < 0 || at >= steps.length) return;
    if (state === 'playing' || (state === 'stopped' && stopFromPlayback)) return play(at);
    show(at, false);
  }

  /** Index in `sections` of the section holding step `at` (the last section at the end). */
  const sectionOf = (at: number) => sections.findIndex((s) => s.id === steps[Math.min(at, steps.length - 1)]?.sectionId);

  /** The nearest landing at or before `from` (0 when there is none). */
  function landingAtOrBefore(from: number): number {
    for (let i = from; i >= 0; i--) if (isLanding(steps[i])) return i;
    return 0;
  }

  /** Where the step `old` of a previous timeline sits in the current one. */
  function locate(old: Step): number {
    const sameSource = (s: Step) => s.source === old.source;
    let at = -1;
    if (old.kind === 'chunk' || old.kind === 'item-chunk') {
      at = steps.findIndex(
        (s) => sameSource(s) && s.kind === old.kind && s.sentenceIndex === old.sentenceIndex && s.sentenceStart,
      );
    }
    if (at < 0) at = steps.findIndex((s) => sameSource(s) && s.kind === old.kind);
    if (at < 0) at = steps.findIndex(sameSource);
    if (at >= 0) return at;
    const order = (id: string) => sections.findIndex((s) => s.id === id);
    const oldSection = order(old.sectionId);
    if (oldSection < 0) return 0;
    at = steps.findIndex((s) => {
      const o = order(s.sectionId);
      return o > oldSection || (o === oldSection && s.blockIndex >= old.blockIndex);
    });
    return at < 0 ? steps.length : at;
  }

  function setSpeed(wpm: number) {
    if (state === 'closed' || !Number.isFinite(wpm)) return;
    const clamped = Math.min(MAX_WPM, Math.max(MIN_WPM, wpm));
    if (clamped === settings.wpm) return;
    settings = { ...settings, wpm: clamped };
    emit('settings', settings);
  }

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
        play(index >= steps.length ? 0 : index);
      }
    },
    continue: continueFromStop,
    sentence(delta) {
      if (state === 'closed' || steps.length === 0) return;
      if (delta < 0) {
        if (index >= steps.length) return moveTo(landingAtOrBefore(steps.length - 1));
        const start = landingAtOrBefore(index);
        return moveTo(start === index && index > 0 ? landingAtOrBefore(index - 1) : start);
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
      setSpeed(settings.wpm + delta);
    },
    setSpeed,
    toggleReading() {
      if (state === 'closed') return;
      if (state === 'reading') {
        rampSlot = 0;
        setState(index >= steps.length ? 'idle' : 'paused');
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
    scrub,
    revealedExhibits(sectionId) {
      const section = sections.find((s) => s.id === sectionId);
      return section ? section.exhibits.filter((e) => revealed.has(exhibitKey(e))) : [];
    },
    replaceTimeline(timeline, nextSettings) {
      if (state === 'closed') return;
      const old = steps[index];
      carriedWords = wordsRead();
      visited = new Set();
      cancelTimer();
      load(timeline);
      settings = nextSettings;
      const at = old ? locate(old) : steps.length;
      markPassed(at);
      lastPosition = -1;
      if (state === 'playing' || (state === 'stopped' && stopFromPlayback)) {
        rampSlot = 0;
        show(at, true);
      } else if (state === 'paused' || state === 'stopped') {
        if (at < steps.length) show(at, false);
        else index = at;
      } else {
        index = at;
        if (state === 'reading' && at < steps.length) {
          lastPosition = at;
          const step = steps[at];
          emit('position', { sectionId: step.sectionId, blockIndex: step.blockIndex, source: step.source, index: at });
        }
      }
    },
  };
}
