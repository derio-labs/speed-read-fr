// @vitest-environment jsdom
import type { Doc } from '@speed-read/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtApi } from './ext';
import { createReader, DOCK_WIDTH_PX, install, type Reader } from './reader-entry';
import { BRIDGE_KEY, READER_KEY, type ContentBridge } from './shared';
import { SETTINGS_KEY } from './storage';

const PAGE = `
  <nav id="nav"><p>Home and other links</p></nav>
  <main id="main">
    <h1 id="h1">Title</h1>
    <p id="p1">First paragraph of the main content.</p>
    <p id="p2">Second paragraph with a <a id="link" href="#x">link</a> inside.</p>
    <h2 id="h2">More</h2>
    <p id="p3">Third paragraph after the heading.</p>
  </main>
  <footer><p>Footer words</p></footer>`;

function fakeApi(stored: Record<string, unknown> = {}) {
  const listeners: ((m: unknown, s: unknown) => unknown)[] = [];
  const data = { ...stored };
  const api = {
    runtime: { onMessage: { addListener: vi.fn((fn: (m: unknown, s: unknown) => unknown) => listeners.push(fn)) } },
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(data, items)),
      },
    },
  };
  return { api: api as unknown as ExtApi, raw: api, listeners, data };
}

/** Every word of a doc, in order. */
function words(doc: Doc): string {
  const out: string[] = [];
  for (const section of doc.sections) {
    if (section.heading) out.push(section.heading.text);
    for (const block of section.blocks) {
      const sentences = block.kind === 'prose' ? block.sentences : block.kind === 'list' ? block.items.flatMap((i) => i.sentences) : [];
      for (const s of sentences) out.push(s.tokens.map((t) => t.text).join(' '));
    }
  }
  return out.join(' | ');
}

const hostEl = () => document.querySelector('[data-speed-read-host]') as HTMLElement | null;
const flush = () => new Promise((r) => setTimeout(r, 0));

let bridge: ContentBridge;
let scope: Record<PropertyKey, unknown>;
let reader: Reader | undefined;

beforeEach(() => {
  document.body.innerHTML = PAGE;
  document.documentElement.removeAttribute('style');
  bridge = { contextTarget: () => null, hoverTarget: () => null };
  scope = { [BRIDGE_KEY]: bridge };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  reader?.close();
  reader = undefined;
  vi.useRealTimers();
  window.getSelection()?.removeAllRanges();
});

/** jsdom events are untrusted, so tests that drive the reader by synthetic input turn the filter off. */
function make(stored?: Record<string, unknown>, trustedEventsOnly = false) {
  const fake = fakeApi(stored);
  reader = createReader({ api: fake.api, win: window, scope, trustedEventsOnly });
  return { ...fake, reader };
}

describe('install', () => {
  it('registers one message listener and guards a second evaluation', () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { chrome: fake.api };
    expect(install(s, window)).toBe(true);
    expect(install(s, window)).toBe(false);
    expect(fake.raw.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    expect(s[READER_KEY]).toBeTruthy();
  });

  it('picks the real API over a page element named browser', () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { browser: document.createElement('div'), chrome: fake.api };
    expect(install(s, window)).toBe(true);
    expect(fake.raw.runtime.onMessage.addListener).toHaveBeenCalledOnce();
  });

  it('is not fooled by a page element named like a guard', () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { chrome: fake.api, __speedRead: document.createElement('div') };
    expect(install(s, window)).toBe(true);
  });

  it('does nothing outside an extension', () => {
    const s: Record<PropertyKey, unknown> = {};
    expect(install(s, window)).toBe(false);
    expect(s[READER_KEY]).toBeUndefined();
  });

  it('opens the reader on a mode message and ignores other messages', async () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { browser: fake.api, [BRIDGE_KEY]: bridge };
    install(s, window);
    fake.listeners[0]({ type: 'other' }, {});
    await flush();
    expect(hostEl()).toBeNull();
    fake.listeners[0]({ mode: 'auto' }, {});
    await vi.waitFor(() => expect(hostEl()).not.toBeNull());
    (s[READER_KEY] as Reader).close();
  });
});

describe('what is read', () => {
  it("'auto' reads the selection when one exists", async () => {
    const { reader } = make();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p2')!);
    window.getSelection()!.addRange(range);
    await reader.open('auto');
    expect(words(reader.current!.doc)).toBe('Second paragraph with a link inside.');
  });

  it("'auto' reads the main content from its start without a selection", async () => {
    const { reader } = make();
    await reader.open('auto');
    expect(reader.current!.container.id).toBe('main');
    expect(words(reader.current!.doc)).toBe('Title | First paragraph of the main content. | Second paragraph with a link inside. | More | Third paragraph after the heading.');
  });

  it("'selection' reads the selection", async () => {
    const { reader } = make();
    const range = document.createRange();
    range.setStart(document.getElementById('p1')!.firstChild!, 0);
    range.setEnd(document.getElementById('p1')!.firstChild!, 15);
    window.getSelection()!.addRange(range);
    await reader.open('selection');
    expect(words(reader.current!.doc)).toBe('First paragraph');
  });

  it("'from-here' reads from the remembered context-menu target to the end of its container", async () => {
    bridge.contextTarget = () => document.getElementById('link');
    const { reader } = make();
    await reader.open('from-here');
    expect(words(reader.current!.doc)).toBe('Second paragraph with a link inside. | More | Third paragraph after the heading.');
  });

  it("'from-here' without a remembered target reads the main content from its start", async () => {
    const { reader } = make();
    await reader.open('from-here');
    expect(words(reader.current!.doc)).toMatch(/^Title \| First paragraph/);
  });

  it("'from-block' reads from the outlined block to the end of its container", async () => {
    bridge.hoverTarget = () => document.getElementById('h2');
    const { reader } = make();
    await reader.open('from-block');
    expect(words(reader.current!.doc)).toBe('More | Third paragraph after the heading.');
  });

  it('a target that is no longer in the page falls back to the main content', async () => {
    const gone = document.createElement('p');
    bridge.hoverTarget = () => gone;
    const { reader } = make();
    await reader.open('from-block');
    expect(words(reader.current!.doc)).toMatch(/^Title/);
  });
});

describe('lists, empty containers and the main mode', () => {
  const LIST = `
    <main id="main">
      <p>Intro words.</p>
      <ul id="list">
        <li id="i1">One.</li>
        <li id="i2">Two.<ul><li id="n1">Nested one.</li><li id="n2">Nested two.</li></ul></li>
        <li id="i3">Three.</li>
      </ul>
      <p id="after">After words.</p>
    </main>
    <aside><p id="side">Side words.</p></aside>
    <nav id="nav2"><p>Menu.</p></nav>`;

  const items = (doc: Doc) => {
    const list = doc.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'list');
    return list && list.kind === 'list' ? list.items.map((i) => [i.sentences.map((x) => x.tokens.map((t) => t.text).join(' ')).join(' '), i.index, i.of, i.depth]) : [];
  };

  it('from a nested list item reads from that item, keeping the list numbering', async () => {
    document.body.innerHTML = LIST;
    bridge.hoverTarget = () => document.getElementById('n2');
    const { reader } = make();
    await reader.open('from-block');
    const doc = reader.current!.doc;
    expect(items(doc)).toEqual([
      ['Nested two.', 2, 2, 1],
      ['Three.', 3, 3, 0],
    ]);
    expect(words(doc)).toBe('Nested two. | Three. | After words.');
    expect(doc.sections[0].words).toBe(5);
  });

  it('from a top-level list item keeps that item and its nested items', async () => {
    document.body.innerHTML = LIST;
    bridge.contextTarget = () => document.getElementById('i2');
    const { reader } = make();
    await reader.open('from-here');
    expect(items(reader.current!.doc).map((i) => i[0])).toEqual(['Two.', 'Nested one.', 'Nested two.', 'Three.']);
  });

  it('a block outside the main content whose container extracts to nothing is read alone', async () => {
    document.body.innerHTML = LIST;
    bridge.hoverTarget = () => document.getElementById('side');
    const { reader } = make();
    await reader.open('from-block');
    expect(words(reader.current!.doc)).toBe('Side words.');
  });

  it('a target with nothing readable falls back to the main content', async () => {
    document.body.innerHTML = LIST;
    bridge.hoverTarget = () => document.getElementById('nav2');
    const { reader } = make();
    await reader.open('from-block');
    expect(reader.current!.container.id).toBe('main');
  });

  it("'main' reads the main content even with a selection", async () => {
    const { reader } = make();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p2')!);
    window.getSelection()!.addRange(range);
    await reader.open('main');
    expect(words(reader.current!.doc)).toMatch(/^Title \| First paragraph/);
  });
});

describe('mount', () => {
  it('ignores synthetic input by default: a page script cannot drive the reader or write settings', async () => {
    const fake = fakeApi();
    reader = createReader({ api: fake.api, win: window, scope });
    await reader.open('auto');
    await reader.current!.handle.ready;
    const root = hostEl()!.shadowRoot!.querySelector('.sr-reader') as HTMLElement;
    for (let i = 0; i < 5; i++) root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
    await flush();
    expect(reader.current!.handle.player.settings.wpm).toBe(300);
    expect(fake.raw.storage.local.set).not.toHaveBeenCalled();
  });

  it('when the page removes the host element, the page is restored and the reader is closed', async () => {
    document.documentElement.style.overflow = 'scroll';
    const { reader } = make();
    await reader.open('auto');
    hostEl()!.remove();
    await vi.waitFor(() => expect(reader.current).toBeNull());
    expect(document.documentElement.style.overflow).toBe('scroll');
  });

  it('when the page removes the docked host, the margin goes', async () => {
    const { reader } = make({ [SETTINGS_KEY]: { display: 'dock' } });
    await reader.open('auto');
    document.body.replaceChildren();
    await vi.waitFor(() => expect(reader.current).toBeNull());
    expect(document.documentElement.style.marginRight).toBe('');
  });

  it('appends a host element with an all:initial inline style and a shadow root holding the reader', async () => {
    const { reader } = make();
    await reader.open('auto');
    const host = hostEl()!;
    expect(host.parentElement).toBe(document.body);
    const style = host.getAttribute('style')!;
    expect(style.startsWith('all: initial !important;')).toBe(true);
    for (const prop of ['display', 'position', 'inset', 'z-index']) expect(style).toMatch(new RegExp(`${prop}: [^;]+ !important`));
    expect(host.shadowRoot!.querySelector('.sr-reader')).not.toBeNull();
  });

  it('overlay mode adds the dimmed backdrop and locks page scroll', async () => {
    const { reader } = make();
    await reader.open('auto');
    const host = hostEl()!;
    expect(host.dataset.display).toBe('overlay');
    expect(host.getAttribute('style')).toMatch(/inset: 0(px)? !important/);
    expect(host.shadowRoot!.querySelector('.sr-backdrop')).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it(`docked mode fixes a ${DOCK_WIDTH_PX} px panel to the right and gives the page a matching margin`, async () => {
    const { reader } = make({ [SETTINGS_KEY]: { display: 'dock' } });
    await reader.open('auto');
    const host = hostEl()!;
    expect(DOCK_WIDTH_PX).toBe(420);
    expect(host.dataset.display).toBe('dock');
    expect(host.style.width).toBe('420px');
    expect(host.getAttribute('style')).toMatch(/inset: 0(px)? 0(px)? 0(px)? auto !important/);
    expect(host.shadowRoot!.querySelector('.sr-backdrop')).toBeNull();
    expect(document.documentElement.style.marginRight).toBe('420px');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closing restores scroll and margin, scrolls to the last-read block and outlines it briefly', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.documentElement.style.overflow = 'scroll';
    const { reader } = make();
    await reader.open('auto');
    const p3 = document.getElementById('p3')!;
    reader.current!.handle.player.jumpToBlock({ element: p3 });
    const shadowReader = hostEl()!.shadowRoot!.querySelector('.sr-reader') as HTMLElement;
    shadowReader.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(hostEl()).toBeNull();
    expect(reader.current).toBeNull();
    expect(document.documentElement.style.overflow).toBe('scroll');
    expect(p3.scrollIntoView).toHaveBeenCalled();
    expect(p3.style.outline).not.toBe('');
    vi.advanceTimersByTime(5000);
    expect(p3.style.outline).toBe('');
  });

  it('closing a docked reader removes the page margin', async () => {
    const { reader } = make({ [SETTINGS_KEY]: { display: 'dock' } });
    await reader.open('auto');
    reader.close();
    expect(document.documentElement.style.marginRight).toBe('');
  });

  it('opening again replaces the open reader', async () => {
    const { reader } = make();
    await reader.open('auto');
    await reader.open('auto');
    expect(document.querySelectorAll('[data-speed-read-host]')).toHaveLength(1);
  });
});

describe('settings', () => {
  it('come from storage.local and are saved there', async () => {
    const { reader, raw, data } = make({ [SETTINGS_KEY]: { wpm: 450 } });
    await reader.open('auto');
    await reader.current!.handle.ready;
    expect(reader.current!.handle.player.settings.wpm).toBe(450);
    reader.current!.handle.player.speed(50);
    await flush();
    expect(raw.storage.local.set).toHaveBeenCalled();
    expect((data[SETTINGS_KEY] as { wpm: number }).wpm).toBe(500);
  });

  it('a display change re-mounts in the other mode at the same position', async () => {
    const { reader } = make();
    await reader.open('auto');
    const p3 = document.getElementById('p3')!;
    reader.current!.handle.player.jumpToBlock({ element: p3 });
    const before = reader.current!.handle.player.index;
    (hostEl()!.shadowRoot!.querySelector('.sr-settings-button') as HTMLElement).click();
    const control = hostEl()!.shadowRoot!.querySelector('.sr-settings [name="display"]') as HTMLSelectElement;
    control.value = 'dock';
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(hostEl()?.dataset.display).toBe('dock'));
    expect(document.querySelectorAll('[data-speed-read-host]')).toHaveLength(1);
    expect(document.documentElement.style.marginRight).toBe('420px');
    expect(document.documentElement.style.overflow).toBe('');
    await reader.current!.handle.ready;
    expect(reader.current!.handle.player.index).toBe(before);
  });
});
