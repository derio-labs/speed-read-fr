import { describe, expect, it, vi } from 'vitest';
import type { Token } from './model';
import { fakeClock } from './testing/clock';
import { fakeSpeech, voice } from './testing/speech';
import { BOUNDARY_WAIT_MS, createSpeechDriver, speechRate, VOICES_WAIT_MS } from './tts';

const w = (text: string): Token => ({ kind: 'word', text });
const math = (text: string): Token => ({ kind: 'atom', atom: 'math', text });
const code = (text: string): Token => ({ kind: 'atom', atom: 'code', text });

const LOCAL_EN = voice('Local English', 'en-US', true);
const LOCAL_DE = voice('Local German', 'de-DE', true);
const NET_EN = voice('Network English', 'en-GB', false);

function setup(voices = [LOCAL_DE, LOCAL_EN, NET_EN], { late = false } = {}) {
  const clock = fakeClock();
  const speech = fakeSpeech(late ? [] : voices);
  const driver = createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock, lang: 'en' });
  const handlers = { onChunk: vi.fn(), onEnd: vi.fn(), onWholeSentence: vi.fn() };
  return { clock, speech, driver, handlers, voices };
}

describe('speech driver: availability and voices (spec section 9)', () => {
  it('without the API is unavailable and does nothing', () => {
    const driver = createSpeechDriver(undefined);
    expect(driver.available).toBe(false);
    expect(driver.voices()).toEqual([]);
    expect(() => driver.speak([{ tokens: [w('a')] }], 300, { onChunk() {}, onEnd() {}, onWholeSentence() {} })).not.toThrow();
    expect(() => driver.cancel()).not.toThrow();
  });

  it('reads the voices at start, each labelled local or network', () => {
    const { driver } = setup();
    expect(driver.available).toBe(true);
    expect(driver.voices().map((v) => [v.name, v.local])).toEqual([
      ['Local German', true],
      ['Local English', true],
      ['Network English', false],
    ]);
  });

  it('reads them again on voiceschanged, and concludes no local voice only after it or 2 s', () => {
    const { driver, speech, clock } = setup([NET_EN], { late: true });
    const seen = vi.fn();
    driver.onVoices(seen);
    expect(driver.voices()).toEqual([]);
    expect(driver.noLocalVoice).toBe(false);
    clock.advance(VOICES_WAIT_MS - 1);
    expect(driver.noLocalVoice).toBe(false);
    speech.setVoices([NET_EN]);
    expect(driver.voices().map((v) => v.name)).toEqual(['Network English']);
    expect(driver.noLocalVoice).toBe(true);
    expect(seen).toHaveBeenCalled();
  });

  it('concludes no local voice after 2 s when voiceschanged never fires', () => {
    const { driver, clock } = setup([], { late: true });
    expect(VOICES_WAIT_MS).toBe(2000);
    clock.advance(1999);
    expect(driver.noLocalVoice).toBe(false);
    clock.advance(1);
    expect(driver.noLocalVoice).toBe(true);
  });

  it('defaults to the first local voice of the language, else the first local, never a network voice', () => {
    expect(setup().driver.defaultVoice()?.name).toBe('Local English');
    expect(setup([LOCAL_DE, NET_EN]).driver.defaultVoice()?.name).toBe('Local German');
    expect(setup([NET_EN]).driver.defaultVoice()).toBeNull();
    expect(setup().driver.defaultVoice('de')?.name).toBe('Local German');
  });
});

describe('speech driver: speaking a sentence', () => {
  const chunks = [{ tokens: [w('The'), w('sum'), math('x^2')] }, { tokens: [w('is'), code('f(x)'), w('here.')] }];

  it('one utterance at rate wpm / 180 clamped to 0.5-3, its text without math atoms', () => {
    const { driver, speech, handlers } = setup();
    driver.speak(chunks, 360, handlers);
    expect(speech.spoken).toHaveLength(1);
    const u = speech.spoken[0];
    expect(u.text).toBe('The sum is f(x) here.');
    expect(u.rate).toBe(2);
    expect(u.voice?.name).toBe('Local English');
    expect(speechRate(60)).toBe(0.5);
    expect(speechRate(1000)).toBe(3);
    expect(speechRate(270)).toBe(1.5);
  });

  it('speaks with the picked voice, even a network one', () => {
    const { driver, speech, handlers } = setup();
    driver.setVoice(NET_EN.voiceURI);
    driver.speak(chunks, 300, handlers);
    expect(speech.spoken[0].voice?.name).toBe('Network English');
  });

  it('maps each boundary charIndex to the chunk holding it, skipping math, and reports changes', () => {
    const { driver, speech, handlers } = setup();
    driver.speak(chunks, 300, handlers);
    const u = speech.spoken[0];
    u.boundary(0); // The
    u.boundary(4); // sum
    expect(handlers.onChunk).not.toHaveBeenCalled();
    u.boundary(8); // is
    expect(handlers.onChunk).toHaveBeenLastCalledWith(1);
    u.boundary(11); // f(x)
    u.boundary(16); // here.
    expect(handlers.onChunk).toHaveBeenCalledTimes(1);
    u.end();
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onWholeSentence).not.toHaveBeenCalled();
  });

  it('shows the whole sentence when no boundary comes within 1 s, and drops boundaries for two such sentences in a row', () => {
    const { driver, speech, handlers, clock } = setup();
    expect(BOUNDARY_WAIT_MS).toBe(1000);
    driver.speak(chunks, 300, handlers);
    clock.advance(999);
    expect(handlers.onWholeSentence).not.toHaveBeenCalled();
    clock.advance(1);
    expect(handlers.onWholeSentence).toHaveBeenCalledTimes(1);
    speech.spoken[0].boundary(8); // too late: the whole sentence stays
    expect(handlers.onChunk).not.toHaveBeenCalled();
    speech.spoken[0].end();
    driver.speak(chunks, 300, handlers);
    clock.advance(1000);
    expect(handlers.onWholeSentence).toHaveBeenCalledTimes(2);
    speech.spoken[1].end();
    expect(driver.boundaryless).toBe(true);
    // From now on: the whole sentence at once, no wait.
    driver.speak(chunks, 300, handlers);
    expect(handlers.onWholeSentence).toHaveBeenCalledTimes(3);
  });

  it('a sentence with boundaries between two without resets the count', () => {
    const { driver, speech, handlers, clock } = setup();
    driver.speak(chunks, 300, handlers);
    clock.advance(1000);
    speech.spoken[0].end();
    driver.speak(chunks, 300, handlers);
    speech.spoken[1].boundary(0);
    speech.spoken[1].end();
    driver.speak(chunks, 300, handlers);
    clock.advance(1000);
    speech.spoken[2].end();
    expect(driver.boundaryless).toBe(false);
  });

  it('cancel() cancels the utterance and suppresses its callbacks', () => {
    const { driver, speech, handlers, clock } = setup();
    driver.speak(chunks, 300, handlers);
    driver.cancel();
    expect(speech.synth.cancel).toHaveBeenCalled();
    speech.spoken[0].boundary(8);
    speech.spoken[0].end();
    clock.advance(2000);
    expect(handlers.onChunk).not.toHaveBeenCalled();
    expect(handlers.onEnd).not.toHaveBeenCalled();
    expect(handlers.onWholeSentence).not.toHaveBeenCalled();
  });

  it('a new speak replaces the one before without its callbacks', () => {
    const { driver, speech, handlers } = setup();
    driver.speak(chunks, 300, handlers);
    const second = { onChunk: vi.fn(), onEnd: vi.fn(), onWholeSentence: vi.fn() };
    driver.speak(chunks, 300, second);
    speech.spoken[0].end();
    expect(handlers.onEnd).not.toHaveBeenCalled();
    speech.spoken[1].end();
    expect(second.onEnd).toHaveBeenCalled();
  });

  it('a sentence of math alone is not spoken: it ends at once', () => {
    const { driver, speech, handlers, clock } = setup();
    driver.speak([{ tokens: [math('x')] }], 300, handlers);
    expect(speech.spoken).toHaveLength(0);
    expect(handlers.onEnd).not.toHaveBeenCalled(); // never from inside speak()
    clock.advance(0);
    expect(handlers.onEnd).toHaveBeenCalled();
  });
});
