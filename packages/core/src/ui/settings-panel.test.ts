// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ARTICLE, mountHarness } from '../testing/reader';

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

  it('applies words per chunk at once, keeping the position, and saves it', async () => {
    const t = mountHarness('<p>a bb cc dd ee ff gg hh ii.</p>');
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
