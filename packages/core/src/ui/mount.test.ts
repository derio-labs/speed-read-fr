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
