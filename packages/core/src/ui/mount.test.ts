// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extract } from '../extract/extract';
import { DEFAULT_SETTINGS, memoryStore } from '../settings';
import { ARTICLE, mountHarness } from '../testing/reader';
import { createCloneHost } from './clone-host';
import { mountReader } from './mount';
import { SENTINEL_PROPERTY } from './styles';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('mountReader', () => {
  it('returns a handle with destroy and the player', () => {
    const t = mountHarness(ARTICLE);
    expect(typeof t.handle.destroy).toBe('function');
    expect(t.handle.player.state).toBe('idle');
  });

  it('applies the settings the store loads', async () => {
    const t = mountHarness(ARTICLE, { saved: { wpm: 450, chunkWords: 1 } });
    await t.settle();
    expect(t.handle.player.settings.wpm).toBe(450);
    expect(t.handle.player.settings.chunkWords).toBe(1);
  });

  it('applySettings applies settings pushed by the host without saving them', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    const save = vi.mocked(t.store.save);
    t.handle.applySettings({ ...DEFAULT_SETTINGS, chunkWords: 1, code: { mode: 'skip', dwellSeconds: 5 } });
    expect(t.handle.player.settings.chunkWords).toBe(1);
    expect(t.handle.player.settings.code.mode).toBe('skip');
    t.handle.applySettings({ ...DEFAULT_SETTINGS, chunkWords: 1, code: { mode: 'skip', dwellSeconds: 5 }, wpm: 600 });
    expect(t.handle.player.settings.wpm).toBe(600);
    expect(save).not.toHaveBeenCalled();
  });

  it('builds outline, stage and exhibit regions with roles and labels', () => {
    const t = mountHarness(ARTICLE);
    expect(t.reader.getAttribute('aria-label')).toBe('Speed reader');
    expect(t.q('nav.sr-outline')?.getAttribute('aria-label')).toBe('Outline');
    const stage = t.q('.sr-stage')!;
    expect(stage.getAttribute('role')).toBe('region');
    expect(stage.getAttribute('aria-label')).toBe('Reader stage');
    const pane = t.q('.sr-exhibits')!;
    expect(pane.getAttribute('role')).toBe('region');
    expect(pane.getAttribute('aria-label')).toBe('Exhibits');
  });

  it('focuses the reader root', () => {
    const t = mountHarness(ARTICLE);
    expect(document.activeElement).toBe(t.reader);
  });

  it('mounts into a shadow root', () => {
    document.body.innerHTML = '<div id="src"><p>Hello there.</p></div><div id="host"></div>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    const src = document.getElementById('src')!;
    const handle = mountReader(shadow, extract(src), { settings: DEFAULT_SETTINGS, store: memoryStore(), host: createCloneHost(src) });
    expect(shadow.querySelector('.sr-reader')).not.toBeNull();
    handle.destroy();
    expect(shadow.querySelector('.sr-reader')).toBeNull();
  });
});

describe('styles', () => {
  it('falls back to a <style> element when constructable sheets are unavailable', () => {
    const t = mountHarness(ARTICLE);
    const style = t.mount.querySelector('style');
    expect(style?.textContent).toContain(SENTINEL_PROPERTY);
  });

  function stubAdoption(sentinel: string, throws = false) {
    const adopted: unknown[] = [];
    class Sheet {
      css = '';
      replaceSync(css: string) {
        if (throws) throw new Error('blocked');
        this.css = css;
      }
    }
    vi.stubGlobal('CSSStyleSheet', Sheet);
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      get: () => adopted.slice(),
      set: (v: unknown[]) => {
        adopted.splice(0, adopted.length, ...v);
      },
    });
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      const style = real(el);
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'getPropertyValue')
            return (name: string) => (name === SENTINEL_PROPERTY && (el as HTMLElement).classList.contains('sr-reader') ? sentinel : target.getPropertyValue(name));
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    return adopted;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
  });

  it('adopts a constructable sheet and inserts no <style> when the sentinel reads back', () => {
    const adopted = stubAdoption('1');
    const t = mountHarness(ARTICLE);
    expect(adopted).toHaveLength(1);
    expect(t.mount.querySelector('style')).toBeNull();
    t.handle.destroy();
    expect(adopted).toHaveLength(0);
  });

  it('inserts a <style> element when the adopted sheet is not applied (sentinel absent)', () => {
    const adopted = stubAdoption('');
    const t = mountHarness(ARTICLE);
    expect(t.mount.querySelector('style')).not.toBeNull();
    expect(adopted).toHaveLength(0);
  });

  it('inserts a <style> element when adopting throws', () => {
    stubAdoption('1', true);
    const t = mountHarness(ARTICLE);
    expect(t.mount.querySelector('style')).not.toBeNull();
  });
});

describe('destroy', () => {
  it('removes everything, closes the player and does not report a close to the host', () => {
    const t = mountHarness(ARTICLE);
    t.handle.player.toggle();
    t.handle.destroy();
    expect(t.mount.childNodes).toHaveLength(0);
    expect(t.handle.player.state).toBe('closed');
    expect(t.host.onClose).not.toHaveBeenCalled();
    t.handle.destroy();
  });
  // Releasing shown nodes on destroy is asserted with the zones that show them (exhibits, reading).
});

describe('document text', () => {
  it('is never assigned through innerHTML while the reader runs', () => {
    const t0 = '<h1>&lt;img src=x onerror="window.__pwned=1"&gt; Title</h1><p>Body text.</p><pre>code</pre><ul><li>a</li></ul>';
    const setter = vi.spyOn(Element.prototype, 'innerHTML', 'set');
    const t = mountHarness(t0, { settings: { stopLevels: [] } });
    setter.mockClear();
    const p = t.handle.player;
    p.toggle();
    t.clock.advance(10_000);
    p.continue();
    t.clock.advance(10_000);
    p.toggleReading();
    p.toggleReading();
    expect(setter).not.toHaveBeenCalled();
    expect(t.reader.querySelector('img')).toBeNull();
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe('host bridge', () => {
  it('reports positions and the close', () => {
    const t = mountHarness(ARTICLE);
    t.handle.player.toggle();
    expect(t.host.onPosition).toHaveBeenCalledWith(expect.objectContaining({ element: t.source.querySelector('h1'), line: 1 }));
    t.handle.player.close();
    expect(t.host.onClose).toHaveBeenCalledTimes(1);
  });

  it('saves speed changes through the store', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    t.handle.player.speed(25);
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ wpm: 325 }));
  });
});

describe('a store that refuses a save (l-errors-r3)', () => {
  const note = (t: ReturnType<typeof mountHarness>) => t.q('.sr-status [data-note="host"]')?.textContent ?? null;

  it('catches the rejection and shows "Settings not saved" in the status line; a later good save clears it', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    vi.mocked(t.store.save).mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));
    t.handle.player.speed(25);
    await new Promise((r) => setTimeout(r, 0));
    expect(note(t)).toBe('Settings not saved');
    t.handle.player.speed(25);
    await new Promise((r) => setTimeout(r, 0));
    expect(note(t)).toBeNull();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('a store whose save throws synchronously is caught too, for a timeline-changing setting', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    vi.mocked(t.store.save).mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });
    t.qa<HTMLButtonElement>('.sr-settings-button')[0].click();
    const words = t.q<HTMLInputElement>('.sr-settings [name="chunkWords"]')!;
    words.value = '2';
    words.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(t.handle.player.settings.chunkWords).toBe(2);
    expect(note(t)).toBe('Settings not saved');
  });

  it('setStatusNote shows and clears a host note', () => {
    const t = mountHarness(ARTICLE);
    t.handle.setStatusNote('Settings not saved');
    expect(note(t)).toBe('Settings not saved');
    t.handle.setStatusNote(null);
    expect(note(t)).toBeNull();
  });
});

describe('flow motion is a live setting', () => {
  it('changes without rebuilding the timeline, moving the position, or restarting the sentence, and is saved', async () => {
    const t = mountHarness('<p>alpha beta gamma delta epsilon zeta eta theta.</p>', { settings: { readingMode: 'flow', flowMotion: 'flowing', chunkWords: 1 } });
    await t.settle();
    t.handle.player.toggle();
    t.clock.advance(t.clock.nextIn()!);
    t.clock.advance(t.clock.nextIn()!);
    const player = t.handle.player;
    const at = player.index;
    expect(at).toBeGreaterThan(1);
    const seen: unknown[] = [];
    player.on('settings', (s) => seen.push(s.flowMotion));
    t.store.save.mockClear();
    t.q<HTMLButtonElement>('.sr-settings-button')!.click();
    const select = t.q<HTMLSelectElement>('.sr-settings [name="flowMotion"]')!;
    select.value = 'word';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(player.index).toBe(at);
    expect(player.state).toBe('playing');
    expect(seen).toEqual(['word']);
    expect(player.settings.flowMotion).toBe('word');
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ flowMotion: 'word' }));
  });
});

describe('red letters is a live setting', () => {
  it('sets data-red-letters at mount and flips it without rebuilding the timeline; the panel saves the choice', async () => {
    const t = mountHarness(ARTICLE);
    await t.settle();
    const reader = t.q<HTMLElement>('.sr-reader')!;
    expect(reader.dataset.redLetters).toBe('on');
    const rebuild = vi.spyOn(t.handle.player, 'replaceTimeline');
    t.handle.applySettings({ ...t.handle.player.settings, redLetters: false });
    expect(reader.dataset.redLetters).toBe('off');
    t.handle.applySettings({ ...t.handle.player.settings, redLetters: true });
    expect(reader.dataset.redLetters).toBe('on');
    t.store.save.mockClear();
    t.q<HTMLButtonElement>('.sr-settings-button')!.click();
    const box = t.q<HTMLInputElement>('.sr-settings [name="redLetters"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(reader.dataset.redLetters).toBe('off');
    expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ redLetters: false }));
    expect(rebuild).not.toHaveBeenCalled();
  });
});
