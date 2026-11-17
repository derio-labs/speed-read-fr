/**
 * Text-to-speech over the Web Speech API (spec section 9, R22). One utterance per sentence; word
 * boundaries pick the chunk on show; a voice without boundaries shows the whole sentence instead.
 */
import type { Token } from './model';

/** A voice as `speechSynthesis.getVoices()` returns it. */
export interface SpeechVoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default?: boolean;
}

export interface UtteranceLike {
  text: string;
  rate: number;
  lang: string;
  voice: SpeechVoiceLike | null;
  onboundary: ((event: { charIndex: number; name?: string }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

/** The part of `speechSynthesis` the driver uses. */
export interface SpeechSynth {
  getVoices(): SpeechVoiceLike[];
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  addEventListener?(type: 'voiceschanged', fn: () => void): void;
  removeEventListener?(type: 'voiceschanged', fn: () => void): void;
}

/** A voice for the settings panel. */
export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  /** From `localService`: works offline. */
  local: boolean;
}

export interface SpeechHandlers {
  /** A boundary moved into chunk `index` of the sentence. */
  onChunk(index: number): void;
  /** The utterance ended: the next sentence may start. */
  onEnd(): void;
  /** No boundaries for this sentence: show it whole until `onEnd`. */
  onWholeSentence(): void;
  /** The voice failed on this sentence (not a cancel): show it as text; nothing more is spoken for it. */
  onError?(): void;
}

export interface SpeechDriver {
  readonly available: boolean;
  voices(): VoiceInfo[];
  /** True once `voiceschanged` fired or 2 s passed with no local voice listed. */
  readonly noLocalVoice: boolean;
  /** The voice in use when none is picked: the first local voice of `lang`, else the first local one. */
  defaultVoice(lang?: string): VoiceInfo | null;
  /** The picked voice (any voice, a network one too), or null for the default. */
  setVoice(uri: string | null): void;
  /** The voice speech uses now: the picked one when it exists, else the default. */
  currentVoice(): VoiceInfo | null;
  /** Called when the voice list changes, the wait for it ends, or speech fails. */
  onVoices(fn: () => void): () => void;
  /** Speak one sentence given as its chunks; replaces anything being spoken. */
  speak(chunks: { tokens: Token[] }[], wpm: number, handlers: SpeechHandlers): void;
  cancel(): void;
  /** An utterance of ours is being spoken. */
  readonly inFlight: boolean;
  /** Two errors in a row: speech is off for the rest of the session ("Speech failed: showing text only"). */
  readonly failed: boolean;
  /** The current voice sent no boundaries for two sentences in a row: it shows whole sentences from now on. */
  readonly boundaryless: boolean;
  destroy(): void;
}

export interface SpeechDriverOptions {
  Utterance?: new (text: string) => UtteranceLike;
  scheduler?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  /** Document or UI language for the default voice. */
  lang?: string;
}

/** Wait for a first boundary before showing the whole sentence. */
export const BOUNDARY_WAIT_MS = 1000;
/** Wait for `voiceschanged` before concluding there is no local voice. */
export const VOICES_WAIT_MS = 2000;
/** Sentences in a row without boundaries after which a voice counts as boundary-less. */
const BOUNDARYLESS_AFTER = 2;
/** Longest utterance: browsers cut off long ones (Chrome at about 15 s). */
export const MAX_UTTERANCE_CHARS = 200;
/** An utterance whose end has not come after max(5 s, 3 x its estimated duration) counts as ended. */
const WATCHDOG_MIN_MS = 5000;
const WATCHDOG_FACTOR = 3;
/** Errors in a row after which speech is given up for the session. */
const FAILED_AFTER_ERRORS = 2;

interface Part {
  text: string;
  starts: { at: number; chunk: number }[];
  words: number;
}

/** Speech rate for a reading speed: wpm / 180, clamped to 0.5-3. */
export const speechRate = (wpm: number) => Math.min(3, Math.max(0.5, wpm / 180));

const info = (v: SpeechVoiceLike): VoiceInfo => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService });
const primary = (lang: string) => lang.toLowerCase().split(/[-_]/)[0];

export function createSpeechDriver(
  synth: SpeechSynth | undefined = (globalThis as { speechSynthesis?: SpeechSynth }).speechSynthesis,
  options: SpeechDriverOptions = {},
): SpeechDriver {
  const Utterance = options.Utterance ?? (globalThis as { SpeechSynthesisUtterance?: new (text: string) => UtteranceLike }).SpeechSynthesisUtterance;
  const timers = options.scheduler ?? { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as number) };
  const available = !!synth && !!Utterance;
  const listeners = new Set<() => void>();
  let raw: SpeechVoiceLike[] = [];
  let settled = false;
  let picked: string | null = null;
  const withoutBoundaries = new Map<string, number>();
  /** Bumped on every speak and cancel: callbacks of an older utterance are dropped. */
  let generation = 0;
  let wait: unknown = null;

  const notify = () => listeners.forEach((fn) => fn());
  function readVoices() {
    try {
      raw = synth?.getVoices() ?? [];
    } catch {
      raw = [];
    }
  }
  const onChanged = () => {
    readVoices();
    settled = true;
    notify();
  };
  let settleTimer: unknown = null;
  if (available) {
    readVoices();
    synth!.addEventListener?.('voiceschanged', onChanged);
    settleTimer = timers.setTimeout(() => {
      settleTimer = null;
      if (settled) return;
      readVoices();
      settled = true;
      notify();
    }, VOICES_WAIT_MS);
  }

  function defaultVoice(lang = options.lang): SpeechVoiceLike | null {
    const local = raw.filter((v) => v.localService);
    const want = lang ? primary(lang) : null;
    return (want ? local.find((v) => primary(v.lang) === want) : undefined) ?? local[0] ?? null;
  }
  const current = () => (picked ? raw.find((v) => v.voiceURI === picked) : undefined) ?? defaultVoice();
  const voiceKey = () => current()?.voiceURI ?? '';

  /** The utterance in flight, held so the browser cannot collect it before it ends (p5b-r1). */
  let inFlight: UtteranceLike | null = null;
  let watchdog: unknown = null;
  let errorsInRow = 0;
  let failed = false;

  function stopWaiting() {
    if (wait !== null) timers.clearTimeout(wait);
    wait = null;
  }
  function stopWatchdog() {
    if (watchdog !== null) timers.clearTimeout(watchdog);
    watchdog = null;
  }

  function cancel() {
    generation++;
    stopWaiting();
    stopWatchdog();
    // Only our own utterance: the page's speech is left alone (p5b-r9).
    if (inFlight && available) synth!.cancel();
    inFlight = null;
  }
  return {
    available,
    voices: () => raw.map(info),
    get noLocalVoice() {
      return settled && !raw.some((v) => v.localService);
    },
    defaultVoice(lang) {
      const v = defaultVoice(lang);
      return v ? info(v) : null;
    },
    setVoice(uri) {
      picked = uri;
    },
    currentVoice() {
      const v = current();
      return v ? info(v) : null;
    },
    onVoices(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get boundaryless() {
      return (withoutBoundaries.get(voiceKey()) ?? 0) >= BOUNDARYLESS_AFTER;
    },
    get inFlight() {
      return inFlight !== null;
    },
    get failed() {
      return failed;
    },
    speak(chunks, wpm, handlers) {
      if (!available) return;
      cancel();
      const gen = ++generation;
      // Spoken text: words and code atoms; math atoms are left out, and their characters with them.
      // A long sentence is split at chunk boundaries into parts of at most 200 characters (p5b-r2).
      const parts: Part[] = [];
      let part: Part = { text: '', starts: [], words: 0 };
      chunks.forEach((c, chunk) => {
        const spoken = c.tokens.filter((t) => !(t.kind === 'atom' && t.atom === 'math'));
        if (spoken.length === 0) return;
        const piece = spoken.map((t) => t.text).join(' ');
        if (part.text && part.text.length + 1 + piece.length > MAX_UTTERANCE_CHARS) {
          parts.push(part);
          part = { text: '', starts: [], words: 0 };
        }
        for (const t of spoken) {
          if (part.text) part.text += ' ';
          part.starts.push({ at: part.text.length, chunk });
          part.text += t.text;
          part.words++;
        }
      });
      if (part.text) parts.push(part);
      if (parts.length === 0) {
        timers.setTimeout(() => gen === generation && handlers.onEnd(), 0);
        return;
      }
      const voice = current();
      const key = voice?.voiceURI ?? '';
      const rate = speechRate(wpm);
      let shown = 0;
      let whole = false;
      let heard = false;
      const showWhole = () => {
        whole = true;
        withoutBoundaries.set(key, (withoutBoundaries.get(key) ?? 0) + 1);
        handlers.onWholeSentence();
      };

      const speakPart = (n: number) => {
        const { text, starts, words } = parts[n];
        const u = new Utterance!(text);
        u.rate = rate;
        u.voice = voice;
        if (voice) u.lang = voice.lang;
        u.onboundary = (e) => {
          if (gen !== generation || whole || (e.name && e.name !== 'word')) return;
          if (!heard) {
            heard = true;
            stopWaiting();
            withoutBoundaries.set(key, 0);
          }
          let chunk = starts[0].chunk;
          for (const st of starts) if (st.at <= e.charIndex) chunk = st.chunk;
          if (chunk !== shown) {
            shown = chunk;
            handlers.onChunk(chunk);
          }
        };
        let finished = false;
        const done = () => {
          if (gen !== generation || finished) return;
          finished = true;
          stopWatchdog();
          inFlight = null;
          if (n + 1 < parts.length) return speakPart(n + 1);
          generation++;
          stopWaiting();
          errorsInRow = 0;
          handlers.onEnd();
        };
        u.onend = done;
        u.onerror = (e) => {
          if (gen !== generation || finished || e.error === 'interrupted' || e.error === 'canceled') return;
          // Never advance on an error (p5b-r3): stop, report, and give up speech after two in a row.
          cancel();
          errorsInRow++;
          if (errorsInRow >= FAILED_AFTER_ERRORS && !failed) {
            failed = true;
            notify();
          }
          handlers.onError?.();
        };
        // The end may never come (a cut-off long utterance, a dropped speak): treat it as ended.
        const estimate = (words / (180 * rate)) * 60_000;
        watchdog = timers.setTimeout(() => {
          watchdog = null;
          if (gen !== generation) return;
          if (available) synth!.cancel();
          done();
        }, Math.max(WATCHDOG_MIN_MS, WATCHDOG_FACTOR * estimate));
        inFlight = u;
        synth!.speak(u);
      };

      if ((withoutBoundaries.get(key) ?? 0) >= BOUNDARYLESS_AFTER) showWhole();
      else
        wait = timers.setTimeout(() => {
          wait = null;
          if (gen === generation && !heard) showWhole();
        }, BOUNDARY_WAIT_MS);
      speakPart(0);
    },
    cancel,
    destroy() {
      cancel();
      if (settleTimer !== null) timers.clearTimeout(settleTimer);
      synth?.removeEventListener?.('voiceschanged', onChanged);
      listeners.clear();
    },
  };
}
