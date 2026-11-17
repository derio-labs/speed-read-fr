/** A fake Web Speech API (`speechSynthesis` and `SpeechSynthesisUtterance`) the test drives by hand. */
import { vi } from 'vitest';
import type { SpeechSynth, SpeechVoiceLike, UtteranceLike } from '../tts';

export const voice = (name: string, lang: string, localService: boolean): SpeechVoiceLike => ({
  name,
  lang,
  localService,
  voiceURI: `voice:${name}`,
  default: false,
});

export interface FakeUtterance extends UtteranceLike {
  /** Fire a word boundary at `charIndex`. */
  boundary(charIndex: number): void;
  end(): void;
}

export function fakeSpeech(initial: SpeechVoiceLike[] = []) {
  let voices = initial;
  const spoken: FakeUtterance[] = [];
  const changed = new Set<() => void>();
  class Utterance implements FakeUtterance {
    text: string;
    rate = 1;
    lang = '';
    voice: SpeechVoiceLike | null = null;
    onboundary: ((e: { charIndex: number; name?: string }) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
    boundary(charIndex: number) {
      this.onboundary?.({ charIndex, name: 'word' });
    }
    end() {
      this.onend?.();
    }
  }
  const synth: SpeechSynth & { cancel: ReturnType<typeof vi.fn>; speak: ReturnType<typeof vi.fn> } = {
    getVoices: () => voices,
    speak: vi.fn((u: UtteranceLike) => {
      spoken.push(u as FakeUtterance);
    }),
    cancel: vi.fn(),
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'voiceschanged') changed.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      if (type === 'voiceschanged') changed.delete(fn);
    },
  };
  return {
    synth,
    Utterance: Utterance as unknown as new (text: string) => UtteranceLike,
    spoken,
    /** Replace the voice list and fire voiceschanged. */
    setVoices(next: SpeechVoiceLike[]) {
      voices = next;
      for (const fn of changed) fn();
    },
  };
}
