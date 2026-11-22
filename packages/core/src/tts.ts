/**
 * Text-to-speech over the Web Speech API (spec section 9, R22). One utterance per sentence; word
 * boundaries pick the chunk on show. When there are no boundaries, either estimate chunk timing
 * from the voice's start or show the whole sentence, depending on the host.
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
  /** Fired when the voice starts speaking the utterance. */
  onstart?: (() => void) | null;
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
  /** Why speech is off on this browser although the API exists (see `speechBlockedReason`); else null. */
  readonly unavailableReason: string | null;
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
  /** Two errors in a row: speech is off until the reader changes voice or reopens. */
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
  /** Keep displaying chunks with estimated timing when the voice does not send word boundaries. */
  estimateBoundaries?: boolean;
  /** Turn speech off on this browser, for this reason: the engine is never touched (`speechBlockedReason`). */
  blockedReason?: string | null;
}

/**
 * Why speech must stay off in the browser with this user agent, or null when it may run.
 *
 * Gecko on macOS (Firefox, and forks such as Zen) is blocked. In an operator walk on 2026-11-22 its speech
 * engine ended every utterance with a loud bang, played a given rate about twice as fast as Chrome, and after
 * one `cancel()` mid-utterance never spoke again until the browser restarted. The reader cancels on every
 * speed change, scrub and jump, and none of this can be worked around from page script, so speech is off.
 * Gecko's own token is `Gecko/<date>`; Chromium only says `like Gecko`.
 */
export function speechBlockedReason(userAgent: string | undefined): string | null {
  if (!userAgent || !/\bGecko\/\d/.test(userAgent) || !/Macintosh|Mac OS X/.test(userAgent)) return null;
  return 'Text-to-speech is off in Firefox on macOS: its speech engine is unreliable and can play loud noise';
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
  const unavailableReason = options.blockedReason ?? null;
  const available = !unavailableReason && !!synth && !!Utterance;
  const listeners = new Set<() => void>();
  let raw: SpeechVoiceLike[] = [];
  let settled = false;
  let picked: string | null = null;
  let fallback: string | null = null;
  const failedStarts = new Set<string>();
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
  const current = () => raw.find((v) => v.voiceURI === (fallback ?? picked)) ?? defaultVoice();
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
    unavailableReason,
    voices: () => raw.map(info),
    get noLocalVoice() {
      return settled && !raw.some((v) => v.localService);
    },
    defaultVoice(lang) {
      const v = defaultVoice(lang);
      return v ? info(v) : null;
    },
    setVoice(uri) {
      if (picked !== uri) {
        fallback = null;
        failedStarts.clear();
        errorsInRow = 0;
        failed = false;
      }
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
      // A chip (a long atom shown as a numbered token) is read as the word "code" or "formula".
      // A long sentence is split at chunk boundaries into parts of at most 200 characters (p5b-r2).
      const parts: Part[] = [];
      let part: Part = { text: '', starts: [], words: 0 };
      chunks.forEach((c, chunk) => {
        const spoken = c.tokens
          .filter((t) => t.kind !== 'atom' || t.atom !== 'math' || t.full !== undefined)
          .map((t) => (t.kind === 'atom' && t.full !== undefined ? { ...t, text: t.atom === 'code' ? 'code' : 'formula' } : t));
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
      let voice = current();
      const key = voice?.voiceURI ?? '';
      const rate = speechRate(wpm);
      const msPerWord = 60_000 / (180 * rate);
      let shown = 0;
      let whole = false;
      let heard = false;
      const showWhole = () => {
        whole = true;
        withoutBoundaries.set(key, (withoutBoundaries.get(key) ?? 0) + 1);
        handlers.onWholeSentence();
      };
      const showChunk = (chunk: number) => {
        if (chunk <= shown) return;
        shown = chunk;
        handlers.onChunk(chunk);
      };

      const speakPart = (n: number, retried = false) => {
        const { text, starts, words } = parts[n];
        const u = new Utterance!(text);
        u.rate = rate;
        u.voice = voice;
        if (voice) u.lang = voice.lang;
        /** Whether this utterance gave any sign of being spoken: its start or a boundary. */
        let spoke = false;
        let finished = false;
        let realBoundary = false;
        function estimate(at: number) {
          showChunk(starts[at].chunk);
          if (gen !== generation || finished) return;
          const next = starts.findIndex((st, i) => i > at && st.chunk !== starts[at].chunk);
          if (next >= 0) wait = timers.setTimeout(() => {
            wait = null;
            if (gen === generation && !finished && !realBoundary) estimate(next);
          }, (next - at) * msPerWord);
        }
        u.onstart = () => {
          if (spoke) return;
          spoke = true;
          if (options.estimateBoundaries && gen === generation && !finished && !realBoundary) estimate(0);
        };
        u.onboundary = (e) => {
          spoke = true;
          if (gen !== generation || finished || whole || (e.name && e.name !== 'word')) return;
          realBoundary = true;
          if (options.estimateBoundaries) stopWaiting();
          if (!heard) {
            heard = true;
            stopWaiting();
            withoutBoundaries.set(key, 0);
          }
          let chunk = starts[0].chunk;
          for (const st of starts) if (st.at <= e.charIndex) chunk = st.chunk;
          showChunk(chunk);
        };
        const done = () => {
          if (gen !== generation || finished) return;
          finished = true;
          stopWatchdog();
          if (options.estimateBoundaries) stopWaiting();
          inFlight = null;
          if (n + 1 < parts.length) return speakPart(n + 1);
          generation++;
          stopWaiting();
          errorsInRow = 0;
          handlers.onEnd();
        };
        u.onend = done;
        /** Never advance on an error (p5b-r3): stop, report, and give up speech after two in a row. */
        const fail = (error?: string) => {
          if (gen !== generation || finished) return;
          const canRetry = options.estimateBoundaries && !spoke && error !== 'not-allowed' && error !== 'interrupted' && error !== 'canceled';
          if (canRetry && voice) failedStarts.add(voice.voiceURI);
          const alternative = canRetry && !retried
            ? raw.find((v) => v.localService && !failedStarts.has(v.voiceURI) && primary(v.lang) === primary(voice?.lang ?? options.lang ?? v.lang))
            : null;
          if (alternative) {
            finished = true;
            stopWatchdog();
            stopWaiting();
            if (!error) synth!.cancel(); // watchdog: the old utterance may still be queued
            fallback = alternative.voiceURI;
            voice = alternative;
            notify();
            if (gen !== generation) return;
            return speakPart(n, true);
          }
          cancel();
          errorsInRow++;
          if (errorsInRow >= FAILED_AFTER_ERRORS && !failed) {
            failed = true;
            notify();
          }
          handlers.onError?.();
        };
        u.onerror = (e) => {
          if (!options.estimateBoundaries && (e.error === 'interrupted' || e.error === 'canceled')) return;
          fail(e.error);
        };
        // The end may never come (a cut-off long utterance, a dropped speak): treat it as ended, unless
        // the voice never started at all (no start, no boundary): that is a voice that does not speak.
        const estimatedMs = words * msPerWord;
        watchdog = timers.setTimeout(() => {
          watchdog = null;
          if (gen !== generation) return;
          if (!spoke) return fail();
          if (available) synth!.cancel();
          done();
        }, Math.max(WATCHDOG_MIN_MS, WATCHDOG_FACTOR * estimatedMs));
        inFlight = u;
        try {
          synth!.speak(u);
        } catch {
          fail('synthesis-failed');
        }
      };

      if (!options.estimateBoundaries) {
        if ((withoutBoundaries.get(key) ?? 0) >= BOUNDARYLESS_AFTER) showWhole();
        else wait = timers.setTimeout(() => {
          wait = null;
          if (gen === generation && !heard) showWhole();
        }, BOUNDARY_WAIT_MS);
      }
      speakPart(0);
    },
    cancel,
    destroy() {
      cancel();
      if (settleTimer !== null) timers.clearTimeout(settleTimer);
      if (available) synth?.removeEventListener?.('voiceschanged', onChanged);
      listeners.clear();
    },
  };
}
