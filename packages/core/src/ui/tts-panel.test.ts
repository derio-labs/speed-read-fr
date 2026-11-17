// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mountHarness } from '../testing/reader';
import { fakeSpeech, voice } from '../testing/speech';
import { createSpeechDriver } from '../tts';

afterEach(() => {
  document.body.innerHTML = '';
});

type Control = HTMLInputElement & HTMLSelectElement;
const TEXT = '<p>The first sentence is here. A second one follows.</p><pre>code</pre>';

function withSpeech(voices = [voice('Alice', 'en-US', true), voice('Cloud', 'en-GB', false)], opts: { late?: boolean; saved?: object } = {}) {
  const speech = fakeSpeech(opts.late ? [] : voices);
  const t = mountHarness(TEXT, {
    speech: (clock) => createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock, lang: 'en' }),
    saved: opts.saved,
  });
  return { t, speech, clock: t.clock };
}

function openPanel(t: ReturnType<typeof mountHarness>) {
  t.q<HTMLButtonElement>('.sr-settings-button')!.click();
  const panel = t.q('.sr-settings')!;
  const field = (name: string) => panel.querySelector<Control>(`[name="${name}"]`)!;
  const notes = () => [...panel.querySelectorAll('.sr-tts-note')].map((n) => n.textContent);
  return { panel, field, notes };
}

describe('speech settings (spec section 9)', () => {
  it('the toggle is off by default and the offline line is always there', async () => {
    const { t } = withSpeech();
    await t.settle();
    const { field, notes } = openPanel(t);
    expect(field('tts').checked).toBe(false);
    expect(field('tts').disabled).toBe(false);
    expect(notes()).toContain('Offline speech uses voices installed on this device');
  });

  it('without the API the controls are disabled with a note', async () => {
    const t = mountHarness(TEXT, { speech: createSpeechDriver(undefined) });
    await t.settle();
    const { field, notes } = openPanel(t);
    expect(field('tts').disabled).toBe(true);
    expect(field('tts-voice').disabled).toBe(true);
    expect(notes()).toContain('Text-to-speech is not available here');
    expect(notes()).toContain('Offline speech uses voices installed on this device');
  });

  it('lists every voice with a local or network label', async () => {
    const { t } = withSpeech();
    await t.settle();
    const options = [...openPanel(t).field('tts-voice').options].map((o) => o.textContent);
    expect(options).toContain('Alice (en-US) · local');
    expect(options).toContain('Cloud (en-GB) · network');
  });

  it('with no local voice says so, and the toggle cannot be turned on until a voice is picked', async () => {
    const { t, speech, clock } = withSpeech([], { late: true });
    await t.settle();
    const { field, notes } = openPanel(t);
    clock.advance(0);
    speech.setVoices([voice('Cloud', 'en-GB', false)]);
    expect(notes()).toContain('No offline voice installed');
    expect(field('tts').disabled).toBe(true);
    field('tts-voice').value = 'voice:Cloud';
    field('tts-voice').dispatchEvent(new Event('change', { bubbles: true }));
    expect(field('tts').disabled).toBe(false);
    expect(notes()).toContain('This voice needs a network connection');
    field('tts').checked = true;
    field('tts').dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ tts: { enabled: true, voiceURI: 'voice:Cloud' } }));
  });

  it('picking a network voice shows the network warning; a local one does not', async () => {
    const { t } = withSpeech();
    await t.settle();
    const { field, notes } = openPanel(t);
    expect(notes()).not.toContain('This voice needs a network connection');
    field('tts-voice').value = 'voice:Cloud';
    field('tts-voice').dispatchEvent(new Event('change', { bubbles: true }));
    expect(notes()).toContain('This voice needs a network connection');
    field('tts-voice').value = 'voice:Alice';
    field('tts-voice').dispatchEvent(new Event('change', { bubbles: true }));
    expect(notes()).not.toContain('This voice needs a network connection');
  });

  it('saves the choice and shows a saved choice when reopened', async () => {
    const { t } = withSpeech([voice('Alice', 'en-US', true), voice('Cloud', 'en-GB', false)], { saved: { tts: { enabled: true, voiceURI: 'voice:Alice' } } });
    await t.settle();
    const { field } = openPanel(t);
    expect(field('tts').checked).toBe(true);
    expect(field('tts-voice').value).toBe('voice:Alice');
    field('tts').checked = false;
    field('tts').dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ tts: { enabled: false, voiceURI: 'voice:Alice' } }));
  });
});

describe('speech on the stage', () => {
  it('chunks follow the voice boundaries, and a voice without boundaries shows the whole sentence', async () => {
    const { t, speech } = withSpeech([voice('Alice', 'en-US', true)], { saved: { tts: { enabled: true, voiceURI: null }, chunkWords: 1 } });
    await t.settle();
    t.handle.player.toggle();
    expect(speech.spoken.map((u) => u.text)).toEqual(['The first sentence is here.']);
    expect(t.q('.sr-chunk')!.textContent).toBe('The');
    speech.spoken[0].boundary(4);
    expect(t.q('.sr-chunk')!.textContent).toBe('first');
    speech.spoken[0].end();
    expect(speech.spoken[1].text).toBe('A second one follows.');
    t.clock.advance(1000);
    expect(t.q('.sr-display')!.dataset.kind).toBe('whole');
    expect(t.q('.sr-display')!.textContent).toContain('A second one follows.');
    speech.spoken[1].end();
    // The code stop is not spoken.
    expect(t.q('.sr-display')!.dataset.kind).toBe('stop');
    expect(speech.spoken).toHaveLength(2);
  });
});
