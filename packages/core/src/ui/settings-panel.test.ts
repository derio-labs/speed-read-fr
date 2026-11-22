// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { extract } from '../extract/extract';
import { DEFAULT_SETTINGS, memoryStore } from '../settings';
import { ARTICLE, mountHarness, chunkSettings } from '../testing/reader';
import { createCloneHost } from './clone-host';
import { focusables } from './dom';
import { mountReader } from './mount';

afterEach(() => {
  document.body.innerHTML = '';
});

type Control = HTMLInputElement & HTMLSelectElement;

function open(t: ReturnType<typeof mountHarness>) {
  t.q<HTMLButtonElement>('.sr-settings-button')!.click();
  const panel = t.q('.sr-settings')!;
  const field = (name: string) => panel.querySelector<Control>(`[name="${name}"]`)!;
  const set = (name: string, value: string | boolean) => {
    const el = field(name);
    if (typeof value === 'boolean') el.checked = value;
    else el.value = value;
    el.dispatchEvent(new Event(typeof value === 'boolean' || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  return { panel, field, set };
}

describe('settings panel', () => {
  it('is a modal dialog opened by the gear button, focusing its first control', () => {
    const t = mountHarness(ARTICLE);
    const { panel } = open(t);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.closest('[hidden]')).toBeNull();
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('has a control for every R12 setting, showing the defaults', () => {
    const t = mountHarness(ARTICLE);
    const { field, panel } = open(t);
    expect(field('wpm').value).toBe('300');
    expect(field('chunkWords').value).toBe('3');
    expect(field('chunkChars').value).toBe('20');
    expect([1, 2, 3, 4, 5, 6].map((l) => field(`stop-h${l}`).checked)).toEqual([true, true, false, false, false, false]);
    for (const kind of ['code', 'table', 'math']) {
      expect(field(`${kind}-mode`).value).toBe('stop');
      expect(field(`${kind}-seconds`).value).toBe('5');
      expect(field(`${kind}-seconds`).disabled).toBe(true);
    }
    expect(field('imageDwellSeconds').value).toBe('3');
    expect(field('display').value).toBe('overlay');
    const tts = field('tts');
    expect(tts.disabled).toBe(true);
    expect(tts.checked).toBe(false);
    expect(tts.closest('.sr-field')!.textContent).toContain('Text-to-speech');
    expect(panel.querySelectorAll('select[name$="-mode"] option')).toHaveLength(9);
  });

  it('has a Focus span field in characters that applies and saves at once', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    const { field, set } = open(t);
    expect(field('focusChars').value).toBe('20');
    expect([field('focusChars').min, field('focusChars').max]).toEqual(['6', '40']);
    set('focusChars', '12');
    expect(t.handle.player.settings.focusChars).toBe(12);
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ focusChars: 12 }));
    set('focusChars', '99');
    expect(t.handle.player.settings.focusChars).toBe(40);
  });

  it('applies words per chunk at once, keeping the position, and saves it', async () => {
    const t = mountHarness('<p>a bb cc dd ee ff gg hh ii.</p>', { settings: chunkSettings });
    await t.settle();
    t.key(' ');
    t.key(' ');
    expect(t.handle.player.state).toBe('paused');
    expect(t.q('.sr-chunk')!.textContent).toBe('a bb cc');
    const { set } = open(t);
    set('chunkWords', '1');
    expect(t.q('.sr-chunk')!.textContent).toBe('a');
    expect(t.handle.player.settings.chunkWords).toBe(1);
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ chunkWords: 1 }));
    set('chunkWords', '8');
    // Eight words would pass the 20-character limit: the chunk stops at seven.
    expect(t.q('.sr-chunk')!.textContent).toBe('a bb cc dd ee ff gg');
    expect(t.handle.player.settings.chunkWords).toBe(8);
  });

  it('selects flow mode immediately and restores the saved choice when Settings reopens', async () => {
    const t = mountHarness('<p>one two three four five six.</p>', { settings: chunkSettings });
    await t.settle();
    t.handle.player.toggle();
    const first = open(t);
    expect(first.field('readingMode').value).toBe('chunk');
    first.set('readingMode', 'flow');
    expect(t.handle.player.settings.readingMode).toBe('flow');
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ readingMode: 'flow' }));
    t.q<HTMLButtonElement>('.sr-settings-done')!.click();
    const reopened = open(t);
    expect(reopened.field('readingMode').value).toBe('flow');
  });

  it('applies speed, stop levels, per-type behaviour, image dwell and display', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    const { set, field } = open(t);
    set('wpm', '450');
    expect(t.handle.player.settings.wpm).toBe(450);
    set('stop-h2', false);
    expect(t.handle.player.settings.stopLevels).toEqual([1]);
    set('code-mode', 'dwell');
    expect(field('code-seconds').disabled).toBe(false);
    set('code-seconds', '9');
    expect(t.handle.player.settings.code).toEqual({ mode: 'dwell', dwellSeconds: 9 });
    set('imageDwellSeconds', '4');
    set('display', 'dock');
    expect(t.handle.player.settings).toMatchObject({ imageDwellSeconds: 4, display: 'dock' });
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ wpm: 450, stopLevels: [1], display: 'dock' }));
  });

  it('clamps out-of-range values and shows the clamped value', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    const { set, field } = open(t);
    set('chunkWords', '40');
    field('chunkWords').dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.handle.player.settings.chunkWords).toBe(10);
    expect(field('chunkWords').value).toBe('10');
  });

  it('shows values loaded from the store at mount', async () => {
    const t = mountHarness(ARTICLE, { saved: { chunkWords: 5, wpm: 400 } });
    await t.settle();
    expect(t.handle.player.settings.readingMode).toBe('flow');
    const { field } = open(t);
    expect(field('chunkWords').value).toBe('5');
    expect(field('wpm').value).toBe('400');
  });

  it('shows the speed changed by the arrow keys when reopened', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    t.key('ArrowUp');
    const { field } = open(t);
    expect(field('wpm').value).toBe('325');
  });
});

describe('display choice (host setting)', () => {
  it('shows the Reader field by default, as the browser reader declares it', () => {
    const t = mountHarness(ARTICLE);
    expect(open(t).field('display')).not.toBeNull();
  });

  it('is absent when the host declares no display, and the current choice is kept', async () => {
    const t = mountHarness(ARTICLE, { display: false, saved: { display: 'dock' } });
    await t.settle();
    const { panel, set } = open(t);
    expect(panel.querySelector('[name="display"]')).toBeNull();
    expect(panel.textContent).not.toContain('Side panel');
    set('wpm', '350');
    expect(t.handle.player.settings.display).toBe('dock');
    expect(t.handle.player.settings.wpm).toBe(350);
  });
});

describe('page fade setting (R29)', () => {
  it('is absent unless the host declares it', () => {
    const t = mountHarness(ARTICLE);
    expect(open(t).panel.querySelector('[name="pageFade"]')).toBeNull();
  });

  it('shows the page strength in percent, applies and saves it, clamped to 10-80', async () => {
    const t = mountHarness(ARTICLE, { pageFade: true });
    await t.settle();
    const { field, set } = open(t);
    expect(field('pageFade').value).toBe('32');
    expect(field('pageFade').min).toBe('10');
    expect(field('pageFade').max).toBe('80');
    set('pageFade', '50');
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ pageFade: 0.5 }));
    set('pageFade', '95');
    field('pageFade').dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ pageFade: 0.8 }));
    expect(field('pageFade').value).toBe('80');
  });
});

describe('focus inside a shadow root (the browser extension; l-tests-r1)', () => {
  function mountInShadow() {
    document.body.innerHTML = '<div id="src"><h1>Title</h1><p>Some words to read here.</p></div><div id="host"></div>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    const doc = extract(document.getElementById('src')!);
    const host = { ...createCloneHost(document.getElementById('src')!), onPosition() {}, onClose() {} };
    const handle = mountReader(shadow, doc, { settings: DEFAULT_SETTINGS, store: memoryStore(), host });
    return { shadow, handle };
  }
  const tab = (shadow: ShadowRoot, shiftKey = false) =>
    (shadow.activeElement ?? shadow.querySelector('.sr-reader'))!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true, composed: true }));

  it('Tab moves from control 1 to 2 to 3 of the settings panel, and wraps', () => {
    const { shadow, handle } = mountInShadow();
    (shadow.querySelector('.sr-settings-button') as HTMLButtonElement).click();
    const controls = focusables(shadow.querySelector<HTMLElement>('.sr-settings')!);
    expect(controls.length).toBeGreaterThan(3);
    expect(shadow.activeElement).toBe(controls[0]);
    tab(shadow);
    expect(shadow.activeElement).toBe(controls[1]);
    tab(shadow);
    expect(shadow.activeElement).toBe(controls[2]);
    for (let i = 3; i < controls.length; i++) tab(shadow);
    expect(shadow.activeElement).toBe(controls[controls.length - 1]);
    tab(shadow);
    expect(shadow.activeElement).toBe(controls[0]);
    tab(shadow, true);
    expect(shadow.activeElement).toBe(controls[controls.length - 1]);
    handle.destroy();
  });

  it('Tab cycles the reader buttons too', () => {
    const { shadow, handle } = mountInShadow();
    const reader = shadow.querySelector<HTMLElement>('.sr-reader')!;
    const list = focusables(reader);
    expect(list.length).toBeGreaterThan(2);
    list[1].focus();
    tab(shadow);
    expect(shadow.activeElement).toBe(list[2]);
    handle.destroy();
  });
});

describe('flow motion field', () => {
  const wrapper = (panel: Element) => panel.querySelector('[name="flowMotion"]')!.closest('.sr-field') as HTMLElement;

  it('is hidden while Reading mode is chunk and shown after switching to flow', () => {
    const t = mountHarness(ARTICLE, { settings: chunkSettings });
    const { panel, set } = open(t);
    expect(wrapper(panel).hidden).toBe(true);
    set('readingMode', 'flow');
    expect(wrapper(panel).hidden).toBe(false);
    set('readingMode', 'chunk');
    expect(wrapper(panel).hidden).toBe(true);
  });

  it('is shown in flow, populated with the stored value, and applies what is picked', () => {
    const t = mountHarness(ARTICLE, { settings: { readingMode: 'flow', flowMotion: 'word' } });
    const { panel, field, set } = open(t);
    expect(wrapper(panel).hidden).toBe(false);
    expect(field('flowMotion').value).toBe('word');
    expect([...field('flowMotion').options].map((o) => o.textContent)).toEqual(['Word by word', 'Flowing']);
    set('flowMotion', 'flowing');
    expect(t.handle.player.settings.flowMotion).toBe('flowing');
  });

  it('keeps the stored value while the field is hidden', () => {
    const t = mountHarness(ARTICLE, { settings: { readingMode: 'flow', flowMotion: 'word' } });
    const { field, set } = open(t);
    set('readingMode', 'chunk');
    expect(t.handle.player.settings.flowMotion).toBe('word');
    expect(t.handle.player.settings.readingMode).toBe('chunk');
    field('flowMotion').value = 'flowing'; // not applied: hidden fields are not read
    set('wpm', '350');
    expect(t.handle.player.settings.flowMotion).toBe('word');
  });
});
