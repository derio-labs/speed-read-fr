import { describe, expect, it, vi } from 'vitest';
import type { Token } from './model';
import { fakeClock } from './testing/clock';
import { fakeSpeech, voice } from './testing/speech';
import { BOUNDARY_WAIT_MS, createSpeechDriver, speechBlockedReason, speechRate, VOICES_WAIT_MS } from './tts';

const w = (text: string): Token => ({ kind: 'word', text });
const math = (text: string): Token => ({ kind: 'atom', atom: 'math', text });
const code = (text: string): Token => ({ kind: 'atom', atom: 'code', text });

const LOCAL_EN = voice('Local English', 'en-US', true);
const LOCAL_DE = voice('Local German', 'de-DE', true);
const NET_EN = voice('Network English', 'en-GB', false);

function setup(voices = [LOCAL_DE, LOCAL_EN, NET_EN], { late = false, estimateBoundaries = false } = {}) {
  const clock = fakeClock();
  const speech = fakeSpeech(late ? [] : voices);
  const driver = createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock, lang: 'en', estimateBoundaries });
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

  it('estimates chunk timing from speech start when a browser voice sends no boundaries', () => {
    const { driver, speech, handlers, clock } = setup(undefined, { estimateBoundaries: true });
    driver.speak([...chunks, { tokens: [w('Next.')] }], 300, handlers);
    speech.spoken[0].start();
    clock.advance(400);
    expect(handlers.onChunk).toHaveBeenLastCalledWith(1);
    clock.advance(600);
    expect(handlers.onChunk).toHaveBeenLastCalledWith(2);
    expect(handlers.onWholeSentence).not.toHaveBeenCalled();
    speech.spoken[0].end();
    expect(handlers.onEnd).toHaveBeenCalledOnce();
  });

  it('tries another local voice on a startup failure and never picks a network fallback', () => {
    const alternate = voice('Alternate English', 'en-GB', true);
    const { driver, speech, handlers } = setup([LOCAL_EN, NET_EN, alternate], { estimateBoundaries: true });
    driver.speak(chunks, 300, handlers);
    speech.spoken[0].onerror!({ error: 'synthesis-failed' });
    expect(speech.spoken[1].voice?.voiceURI).toBe(alternate.voiceURI);
    speech.spoken[1].end();
    expect(handlers.onEnd).toHaveBeenCalledOnce();
    expect(driver.currentVoice()?.uri).toBe(alternate.voiceURI);
  });

  it('lets real boundaries take over from the estimate without jumping back', () => {
    const { driver, speech, handlers, clock } = setup(undefined, { estimateBoundaries: true });
    driver.speak([...chunks, { tokens: [w('Next.')] }], 300, handlers);
    const u = speech.spoken[0];
    u.start();
    clock.advance(400);
    u.boundary(0);
    clock.advance(600);
    expect(handlers.onChunk.mock.calls).toEqual([[1]]);
    u.boundary(u.text.indexOf('Next.'));
    expect(handlers.onChunk.mock.calls).toEqual([[1], [2]]);
  });

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

describe('review p5b: robustness of the speech driver', () => {
  const words = (n: number, word = 'word') => ({ tokens: Array.from({ length: n }, (_, i) => w(`${word}${i}`)) });
  const quiet = () => ({ onChunk: vi.fn(), onEnd: vi.fn(), onWholeSentence: vi.fn(), onError: vi.fn() });

  it('keeps the utterance while it is in flight (p5b-r1)', () => {
    const { driver, speech } = setup();
    const h = quiet();
    expect(driver.inFlight).toBe(false);
    driver.speak([words(3)], 180, h);
    expect(driver.inFlight).toBe(true);
    speech.spoken[0].end();
    expect(driver.inFlight).toBe(false);
  });

  it('a watchdog of max(5 s, 3 x the estimated duration) ends a sentence whose end never comes (p5b-r2)', () => {
    const { driver, speech, clock } = setup();
    const h = quiet();
    driver.speak([words(3)], 180, h); // about 1 s at rate 1
    speech.spoken[0].start();
    clock.advance(4999);
    expect(h.onEnd).not.toHaveBeenCalled();
    clock.advance(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(speech.synth.cancel).toHaveBeenCalled();
    speech.spoken[0].end();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    const long = quiet();
    driver.speak([words(60)], 180, long); // 60 words at 180 wpm: 20 s, watchdog 60 s
    clock.advance(59_000);
    expect(long.onEnd).not.toHaveBeenCalled();
  });

  it('a watchdog firing on an utterance that never started and had no boundary is an error, not an end (l-errors-r5)', () => {
    const { driver, speech, clock } = setup();
    const a = quiet();
    driver.speak([words(3)], 180, a);
    clock.advance(5000);
    expect(a.onEnd).not.toHaveBeenCalled();
    expect(a.onError).toHaveBeenCalledTimes(1);
    expect(driver.failed).toBe(false);
    expect(driver.inFlight).toBe(false);
    speech.spoken[0].end(); // a late end of the cancelled utterance changes nothing
    expect(a.onEnd).not.toHaveBeenCalled();
    const b = quiet();
    driver.speak([words(3)], 180, b);
    clock.advance(5000);
    expect(b.onError).toHaveBeenCalledTimes(1);
    expect(driver.failed).toBe(true);
  });

  it('a watchdog firing after a boundary (no start event) still counts as an end', () => {
    const { driver, speech, clock } = setup();
    const a = quiet();
    driver.speak([words(3)], 180, a);
    speech.spoken[0].boundary(0);
    clock.advance(5000);
    expect(a.onEnd).toHaveBeenCalledTimes(1);
    expect(a.onError).not.toHaveBeenCalled();
    // and resets the failure count: one silent sentence after it is not yet a failure
    const b = quiet();
    driver.speak([words(3)], 180, b);
    clock.advance(5000);
    expect(driver.failed).toBe(false);
  });

  it('splits a sentence over 200 characters into utterances at chunk boundaries, ending after the last (p5b-r2)', () => {
    const { driver, speech } = setup();
    const h = quiet();
    const chunks = Array.from({ length: 12 }, (_, i) => ({ tokens: [w(`alpha${i}`), w(`beta${i}`), w(`gamma${i}`)] }));
    driver.speak(chunks, 300, h);
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0].text.length).toBeLessThanOrEqual(200);
    const firstParts = speech.spoken[0].text.split(' ').length / 3;
    speech.spoken[0].boundary(0);
    speech.spoken[0].end();
    expect(h.onEnd).not.toHaveBeenCalled();
    expect(speech.spoken).toHaveLength(2);
    // A boundary at the start of the second utterance is the first chunk of that part.
    speech.spoken[1].boundary(0);
    expect(h.onChunk).toHaveBeenLastCalledWith(firstParts);
    speech.spoken[1].end();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(speech.spoken.map((u) => u.text).join(' ')).toBe(chunks.flatMap((c) => c.tokens.map((t) => t.text)).join(' '));
  });

  it('an error never advances at once: it reports onError; two in a row fail speech for the session (p5b-r3)', () => {
    const { driver, speech, clock } = setup();
    const a = quiet();
    driver.speak([words(3)], 300, a);
    speech.spoken[0].fail('network');
    expect(a.onEnd).not.toHaveBeenCalled();
    expect(a.onError).toHaveBeenCalledTimes(1);
    expect(driver.failed).toBe(false);
    const b = quiet();
    driver.speak([words(3)], 300, b);
    speech.spoken[1].end(); // a success resets the count
    const c = quiet();
    driver.speak([words(3)], 300, c);
    speech.spoken[2].fail('synthesis-failed');
    const d = quiet();
    driver.speak([words(3)], 300, d);
    speech.spoken[3].fail('network');
    expect(driver.failed).toBe(true);
    // An interruption (our own cancel) is not an error.
    const e = quiet();
    const fresh = setup();
    fresh.driver.speak([words(3)], 300, e);
    fresh.speech.spoken[0].fail('interrupted');
    fresh.speech.spoken[0].fail('canceled');
    expect(e.onError).not.toHaveBeenCalled();
    clock.advance(0);
  });

  it('cancel and destroy leave the page’s own speech alone when nothing of ours is in flight (p5b-r9)', () => {
    const { driver, speech } = setup();
    driver.cancel();
    driver.destroy();
    expect(speech.synth.cancel).not.toHaveBeenCalled();
  });
});

describe('review p5b-r15: boundary mapping', () => {
  function speakOne(chunks: { tokens: Token[] }[]) {
    const r = setup();
    const h = { onChunk: vi.fn(), onEnd: vi.fn(), onWholeSentence: vi.fn(), onError: vi.fn() };
    r.driver.speak(chunks, 300, h);
    return { ...r, h, u: r.speech.spoken[0] };
  }

  it('a math atom first and last in the sentence is skipped', () => {
    const { u, h } = speakOne([{ tokens: [math('x'), w('equals')] }, { tokens: [w('two'), math('y')] }]);
    expect(u.text).toBe('equals two');
    u.boundary(0);
    expect(h.onChunk).not.toHaveBeenCalled();
    u.boundary(7);
    expect(h.onChunk).toHaveBeenLastCalledWith(1);
  });

  it('repeated words map by position, not by text', () => {
    const { u, h } = speakOne([{ tokens: [w('the'), w('the')] }, { tokens: [w('the')] }]);
    u.boundary(4);
    expect(h.onChunk).not.toHaveBeenCalled();
    u.boundary(8);
    expect(h.onChunk).toHaveBeenLastCalledWith(1);
  });

  it('non-ASCII and astral characters count in UTF-16 units, as charIndex does', () => {
    const { u, h } = speakOne([{ tokens: [w('naïve'), w('😀😀')] }, { tokens: [w('über')] }]);
    expect(u.text).toBe('naïve 😀😀 über');
    u.boundary('naïve 😀😀 '.length);
    expect(h.onChunk).toHaveBeenLastCalledWith(1);
  });

  it('a sentence-named boundary event is ignored', () => {
    const { u, h } = speakOne([{ tokens: [w('aa')] }, { tokens: [w('bb')] }]);
    u.boundary(3, 'sentence');
    expect(h.onChunk).not.toHaveBeenCalled();
  });

  it('onerror of kind network reports the error, not an end', () => {
    const { u, h } = speakOne([{ tokens: [w('aa')] }]);
    u.fail('network');
    expect(h.onError).toHaveBeenCalled();
    expect(h.onEnd).not.toHaveBeenCalled();
  });
});

describe('speech driver: chips', () => {
  it('reads a chip as the word "code" or "formula", never its original text', () => {
    const { driver, speech, handlers } = setup();
    const chip = (atom: 'code' | 'math', n: number, full: string): Token => ({ kind: 'atom', atom, text: `⟨${atom} ${n}⟩`, full });
    driver.speak([{ tokens: [w('Call')] }, { tokens: [chip('code', 1, 'a'.repeat(30))] }, { tokens: [chip('math', 1, '\\frac{1}{2}'.repeat(3))] }], 300, handlers);
    expect(speech.spoken[0].text).toBe('Call code formula');
  });
});

describe('speech driver: Gecko on macOS is blocked (debug 2026-11-22-tts-firefox-noise)', () => {
  const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0';
  const ZEN_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0 Zen/1.0';
  const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
  const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
  const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const VSCODE_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.96.0 Chrome/128.0.6613.186 Electron/32.2.6 Safari/537.36';

  it('names a reason for Firefox and Zen on macOS, and none elsewhere', () => {
    expect(speechBlockedReason(FIREFOX_MAC)).toMatch(/Firefox on macOS/);
    expect(speechBlockedReason(ZEN_MAC)).toMatch(/Firefox on macOS/);
    for (const ua of [FIREFOX_LINUX, FIREFOX_WINDOWS, CHROME_MAC, VSCODE_MAC, '', undefined]) expect(speechBlockedReason(ua)).toBeNull();
  });

  it('a blocked driver is unavailable, never touches the engine, and says why', () => {
    const { speech } = setup();
    const driver = createSpeechDriver(speech.synth, { Utterance: speech.Utterance, blockedReason: 'blocked here' });
    expect(driver.available).toBe(false);
    expect(driver.unavailableReason).toBe('blocked here');
    expect(driver.voices()).toEqual([]);
    driver.speak([{ tokens: [w('Hello')] }], 300, { onChunk() {}, onEnd() {}, onWholeSentence() {} });
    driver.cancel();
    driver.destroy();
    expect(speech.synth.speak).not.toHaveBeenCalled();
    expect(speech.synth.cancel).not.toHaveBeenCalled();
    expect(speech.spoken).toEqual([]);
  });

  it('an unblocked driver has no reason', () => {
    expect(setup().driver.unavailableReason).toBeNull();
    expect(createSpeechDriver(undefined).unavailableReason).toBeNull();
  });
});
