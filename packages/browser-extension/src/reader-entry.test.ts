// @vitest-environment jsdom
import type { Doc } from '@speed-read/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtApi } from './ext';
import { ext } from './ext';
import { createReader, DOCK_WIDTH_PX, FOLLOW_TAU_MS, followStep, install, type Reader } from './reader-entry';
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
  const listeners: ((m: unknown, s: unknown, reply?: (r: unknown) => void) => unknown)[] = [];
  const data = { ...stored };
  const api = {
    runtime: { sendMessage: vi.fn(async () => undefined), getURL: vi.fn((path: string) => `chrome-extension://test/${path}`), onMessage: { addListener: vi.fn((fn: (m: unknown, s: unknown, reply?: (r: unknown) => void) => unknown) => listeners.push(fn)) } },
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

/** Animation frames the test runs by hand. */
function fakeFrames() {
  let queue: ((t: number) => void)[] = [];
  let time = 0;
  return {
    source: {
      request(fn: (t: number) => void) {
        queue.push(fn);
        return fn;
      },
      cancel(handle: unknown) {
        queue = queue.filter((f) => f !== handle);
      },
    },
    run(n = 1) {
      for (let i = 0; i < n; i++) {
        time += 16;
        const due = queue;
        queue = [];
        for (const fn of due) fn(time);
      }
    },
    get pending() {
      return queue.length;
    },
  };
}
let frames: ReturnType<typeof fakeFrames>;

/** jsdom events are untrusted, so tests that drive the reader by synthetic input turn the filter off. */
function make(stored?: Record<string, unknown>, trustedEventsOnly = false) {
  const fake = fakeApi(stored);
  frames = fakeFrames();
  reader = createReader({ api: fake.api, win: window, scope, trustedEventsOnly, frame: frames.source });
  return { ...fake, reader };
}

const shadow = () => hostEl()!.shadowRoot!;
/** Stub one element's box. */
function boxOf(el: Element, rect: () => { top: number; left: number; width: number; height: number }) {
  el.getBoundingClientRect = () => {
    const r = rect();
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect;
  };
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

  it('is not switched off by a page form named browser with a control named runtime (l-security-r6)', () => {
    document.body.insertAdjacentHTML('beforeend', '<form id="browser"><input name="runtime"></form>');
    const form = document.getElementById('browser') as HTMLFormElement & { runtime?: unknown };
    // Browsers expose a form's named controls as its properties (jsdom does not): model it.
    Object.defineProperty(form, 'runtime', { value: form.querySelector('input'), configurable: true });
    expect(form.runtime).toBeInstanceOf(HTMLInputElement);
    const fake = fakeApi();
    // A named property the page put on the global: not an own property of the isolated world's scope.
    const s = Object.create({ browser: form }) as Record<PropertyKey, unknown>;
    s.chrome = fake.api;
    expect(ext(s)).toBe(fake.api);
    expect(install(s, window)).toBe(true);
    expect(fake.raw.runtime.onMessage.addListener).toHaveBeenCalledOnce();
  });

  it('ext() accepts an own global only with a real runtime (sendMessage and getURL functions), else falls through to chrome', () => {
    const api = { runtime: { sendMessage() {}, getURL() {}, onMessage: { addListener() {} } } };
    const formLike = { runtime: document.createElement('input') };
    expect(ext({ browser: formLike, chrome: api })).toBe(api);
    expect(ext({ browser: { runtime: { sendMessage() {} } }, chrome: api })).toBe(api);
    expect(ext({ browser: api, chrome: formLike })).toBe(api);
    expect(ext({ chrome: formLike })).toBeUndefined();
    expect(ext(Object.create({ chrome: api }))).toBeUndefined();
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

  it('overlay mode mounts the floating layout, adds no backdrop and does not lock page scroll', async () => {
    const { reader } = make();
    await reader.open('auto');
    const host = hostEl()!;
    expect(host.dataset.display).toBe('overlay');
    expect(host.getAttribute('style')).toMatch(/inset: 0(px)? !important/);
    expect(shadow().querySelector('.sr-reader')!.getAttribute('data-layout')).toBe('floating');
    expect(shadow().querySelector('.sr-backdrop')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
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
    expect(host.shadowRoot!.querySelector('.sr-veil')).toBeNull();
    expect(host.shadowRoot!.querySelector('.sr-reader')!.getAttribute('data-layout')).toBe('panel');
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

describe('floating overlay over the faded page (R17, R29)', () => {
  it('a veil in the page background at 1 - pageFade covers the viewport with a clear window over the block being read', async () => {
    document.body.style.backgroundColor = 'rgb(10, 20, 30)';
    const { reader } = make();
    await reader.open('auto');
    await reader.current!.handle.ready;
    const veil = shadow().querySelector('.sr-veil') as HTMLElement;
    const win = shadow().querySelector('.sr-window') as HTMLElement;
    expect(veil).not.toBeNull();
    expect(veil.style.pointerEvents).toBe('none');
    expect(veil.compareDocumentPosition(shadow().querySelector('.sr-frame')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(win.style.boxShadow).toContain('rgba(10, 20, 30, 0.68)');
    const p3 = document.getElementById('p3')!;
    boxOf(p3, () => ({ top: 120, left: 40, width: 500, height: 48 }));
    reader.current!.handle.player.jumpToBlock({ element: p3 });
    frames.run();
    const px = (v: string) => parseFloat(v);
    expect(px(win.style.top)).toBeLessThanOrEqual(120);
    expect(px(win.style.top) + px(win.style.height)).toBeGreaterThanOrEqual(168);
    expect(px(win.style.left)).toBeLessThanOrEqual(40);
    expect(px(win.style.left) + px(win.style.width)).toBeGreaterThanOrEqual(540);
    document.body.style.backgroundColor = '';
  });

  it('re-places the clear window on scroll and resize without a frame loop (p5a-r1)', async () => {
    const { reader } = make();
    await reader.open('auto');
    await reader.current!.handle.ready;
    const p3 = document.getElementById('p3')!;
    let top = 100;
    boxOf(p3, () => ({ top, left: 0, width: 400, height: 40 }));
    reader.current!.handle.player.jumpToBlock({ element: p3 });
    frames.run(300);
    expect(frames.pending).toBe(0);
    top = 300;
    window.dispatchEvent(new Event('scroll'));
    expect(parseFloat((shadow().querySelector('.sr-window') as HTMLElement).style.top)).toBe(300 - 6);
    top = 200;
    window.dispatchEvent(new Event('resize'));
    expect(parseFloat((shadow().querySelector('.sr-window') as HTMLElement).style.top)).toBe(200 - 6);
  });

  it('a page whose background is only a dark gradient, with light text, gets a dark veil (p5a-r5)', async () => {
    document.body.style.backgroundImage = 'linear-gradient(#0b0d12, #151922)';
    document.body.style.color = 'rgb(230, 232, 238)';
    const { reader } = make();
    await reader.open('auto');
    const shadowValue = (shadow().querySelector('.sr-window') as HTMLElement).style.boxShadow;
    document.body.style.backgroundImage = '';
    document.body.style.color = '';
    expect(shadowValue).not.toContain('rgba(255, 255, 255');
    const [r, g, b] = shadowValue.match(/rgba\((\d+), (\d+), (\d+)/)!.slice(1).map(Number);
    expect(r + g + b).toBeLessThan(150);
  });

  it('a page with no background of its own is veiled in white', async () => {
    const { reader } = make();
    await reader.open('auto');
    expect((shadow().querySelector('.sr-window') as HTMLElement).style.boxShadow).toContain('rgba(255, 255, 255, 0.68)');
  });

  it('the page is scrolled, eased, so the block being read settles at 10 % of the viewport height', async () => {
    const { reader } = make();
    await reader.open('auto');
    await reader.current!.handle.ready;
    const scroller = document.documentElement;
    scroller.scrollTop = 0;
    const p3 = document.getElementById('p3')!;
    boxOf(p3, () => ({ top: 900 - scroller.scrollTop, left: 0, width: 400, height: 40 }));
    reader.current!.handle.player.jumpToBlock({ element: p3 });
    frames.run();
    const first = scroller.scrollTop;
    const target = 900 - window.innerHeight * 0.1;
    // One 16 ms frame of the exponential ease.
    expect(first).toBeCloseTo(target * (1 - Math.exp(-16 / FOLLOW_TAU_MS)), 0);
    frames.run(200);
    expect(Math.abs(scroller.scrollTop - target)).toBeLessThanOrEqual(1);
    // Settled: no frame is pending until the position moves again (p5a-r1).
    expect(frames.pending).toBe(0);
    scroller.scrollTop = 0;
  });

  it('followStep eases exponentially and stops within a pixel', () => {
    expect(followStep(100, 16)).toBeCloseTo(100 * (1 - Math.exp(-16 / FOLLOW_TAU_MS)));
    expect(followStep(-100, 16)).toBeCloseTo(-100 * (1 - Math.exp(-16 / FOLLOW_TAU_MS)));
    expect(followStep(0.6, 16)).toBe(0);
    expect(followStep(3, 1)).toBe(1);
  });

  it('a wheel event on the page side moves the reading position and is not scrolled; over exhibits, outline, settings and normal reading it is not the dial', async () => {
    const { reader } = make();
    await reader.open('auto');
    await reader.current!.handle.ready;
    const root = shadow().querySelector('.sr-reader')!;
    const wheel = (init: WheelEventInit = {}) => new WheelEvent('wheel', { deltaY: 130, bubbles: true, cancelable: true, composed: true, ...init });
    const e = wheel();
    root.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(reader.current!.handle.player.index).toBe(1);
    for (const selector of ['.sr-exhibits', '.sr-reading', '.sr-outline']) {
      shadow().querySelector(selector)!.dispatchEvent(wheel());
    }
    (shadow().querySelector('.sr-settings-button') as HTMLElement).click();
    shadow().querySelector('.sr-settings')!.dispatchEvent(wheel());
    expect(reader.current!.handle.player.index).toBe(1);
  });

  it('over a scroller of its own the wheel scrolls it while it can, and never chains to the page (p5a-r3)', async () => {
    const { reader } = make();
    await reader.open('auto');
    const list = shadow().querySelector('.sr-exhibit-list') as HTMLElement;
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true });
    const wheel = (deltaY: number) => new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, composed: true });
    const down = wheel(100);
    list.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    const up = wheel(-100); // already at the top: nothing to scroll, so the page must not take it
    list.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    const plain = wheel(100); // the reading view in jsdom cannot scroll at all
    shadow().querySelector('.sr-reading')!.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(true);
  });

  it('leaves ctrl+wheel (zoom) and horizontal swipes on the page to the browser (p5a-r4)', async () => {
    const { reader } = make();
    await reader.open('auto');
    const root = shadow().querySelector('.sr-reader')!;
    const zoom = new WheelEvent('wheel', { deltaY: 130, ctrlKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(zoom);
    const swipe = new WheelEvent('wheel', { deltaX: 130, deltaY: 2, bubbles: true, cancelable: true });
    root.dispatchEvent(swipe);
    expect(zoom.defaultPrevented).toBe(false);
    expect(swipe.defaultPrevented).toBe(false);
    expect(reader.current!.handle.player.index).toBe(0);
  });

  it('ignores a page script’s wheel events by default', async () => {
    const fake = fakeApi();
    frames = fakeFrames();
    reader = createReader({ api: fake.api, win: window, scope, frame: frames.source });
    await reader.open('auto');
    shadow().querySelector('.sr-reader')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 500, bubbles: true, cancelable: true }));
    expect(reader.current!.handle.player.index).toBe(0);
  });

  it('pageFade is in the settings panel, changes the veil at once and persists', async () => {
    const { reader, data } = make({ [SETTINGS_KEY]: { pageFade: 0.4 } });
    await reader.open('auto');
    await reader.current!.handle.ready;
    const win = shadow().querySelector('.sr-window') as HTMLElement;
    expect(win.style.boxShadow).toContain('0.6)');
    (shadow().querySelector('.sr-settings-button') as HTMLElement).click();
    const control = shadow().querySelector('.sr-settings [name="pageFade"]') as HTMLInputElement;
    expect(control.value).toBe('40');
    control.value = '75';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect((data[SETTINGS_KEY] as { pageFade: number }).pageFade).toBe(0.75);
    expect(win.style.boxShadow).toContain('0.25)');
  });

  it('closing removes the veil and the window, stops following and leaves the page at the block', async () => {
    const { reader } = make();
    await reader.open('auto');
    const p3 = document.getElementById('p3')!;
    reader.current!.handle.player.jumpToBlock({ element: p3 });
    reader.current!.handle.player.close();
    expect(hostEl()).toBeNull();
    expect(document.querySelector('.sr-veil, .sr-window')).toBeNull();
    expect(p3.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    frames.run(3);
    expect(frames.pending).toBe(0);
  });
});

describe('dock and fixed page elements (p3-r16)', () => {
  const FIXED = `
    <header id="bar" style="position: fixed; top: 0; left: 0; right: 0; height: 48px;">Site</header>
    <button id="fab" style="position: fixed; right: 16px; bottom: 16px;">Help</button>
    <div id="left" style="position: fixed; left: 0; top: 60px; width: 100px;">Left</div>`;

  it('moves fixed elements reaching into the 420 px strip and restores their inline styles exactly', async () => {
    document.body.insertAdjacentHTML('beforeend', FIXED);
    const vw = window.innerWidth;
    const bar = document.getElementById('bar')!;
    const fab = document.getElementById('fab')!;
    const left = document.getElementById('left')!;
    boxOf(bar, () => ({ top: 0, left: 0, width: vw, height: 48 }));
    boxOf(fab, () => ({ top: 700, left: vw - 76, width: 60, height: 32 }));
    boxOf(left, () => ({ top: 60, left: 0, width: 100, height: 20 }));
    // Compared as parsed declarations (the CSSOM serializes `0` as `0px`).
    const before = [bar, fab, left].map((el) => el.style.cssText);
    const { reader } = make({ [SETTINGS_KEY]: { display: 'dock' } });
    await reader.open('auto');
    // Spanning the viewport: narrower by 420 px. At the right edge: moved in by 420 px.
    expect(bar.style.getPropertyValue('right')).toBe('420px');
    expect(bar.style.getPropertyValue('left')).toBe('0px');
    expect(bar.style.getPropertyValue('width')).toBe('auto');
    expect(bar.style.getPropertyPriority('right')).toBe('important');
    expect(fab.style.getPropertyValue('right')).toBe(`${16 + 420}px`);
    expect(fab.style.getPropertyValue('left')).toBe('auto');
    expect(left.style.cssText).toBe(before[2]);
    reader.close();
    expect([bar, fab, left].map((el) => el.style.cssText)).toEqual(before);
  });

  it('the overlay leaves fixed elements alone', async () => {
    document.body.insertAdjacentHTML('beforeend', FIXED);
    const fab = document.getElementById('fab')!;
    boxOf(fab, () => ({ top: 700, left: window.innerWidth - 76, width: 60, height: 32 }));
    const before = fab.getAttribute('style');
    const { reader } = make();
    await reader.open('auto');
    expect(fab.getAttribute('style')).toBe(before);
  });
});

describe('a reader that cannot open (l-errors-r2)', () => {
  const notice = () => document.querySelector('[data-speed-read-notice]');

  it('a failure resolving the new content keeps the open reader open; the handler shows a notice and replies with the cause', async () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { chrome: fake.api, [BRIDGE_KEY]: bridge };
    install(s, window);
    const first = vi.fn();
    fake.listeners[0]({ mode: 'auto' }, {}, first);
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith({ ok: true }));
    const open = (s[READER_KEY] as Reader).current;
    expect(open).not.toBeNull();
    // Extraction of the new content throws.
    const spy = vi.spyOn(window, 'getSelection').mockImplementation(() => {
      throw new Error('extraction exploded');
    });
    const second = vi.fn();
    expect(fake.listeners[0]({ mode: 'auto' }, {}, second)).toBe(true);
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    spy.mockRestore();
    expect(second.mock.calls[0][0]).toEqual({ ok: false, error: 'extraction exploded' });
    expect((s[READER_KEY] as Reader).current).toBe(open);
    expect(hostEl()).not.toBeNull();
    expect(notice()?.textContent).toBe('Speed Read could not read this page');
    (s[READER_KEY] as Reader).close();
  });

  it('the notice dismisses itself', async () => {
    vi.useFakeTimers();
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { chrome: fake.api, [BRIDGE_KEY]: bridge };
    install(s, window);
    const spy = vi.spyOn(window, 'getSelection').mockImplementation(() => {
      throw new Error('extraction exploded');
    });
    const reply = vi.fn();
    fake.listeners[0]({ mode: 'auto' }, {}, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalled());
    spy.mockRestore();
    expect(notice()).not.toBeNull();
    vi.advanceTimersByTime(4000);
    expect(notice()).toBeNull();
  });

  it('a document with no body is a reported failure, not an unhandled rejection', async () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { chrome: fake.api, [BRIDGE_KEY]: bridge };
    install(s, window);
    const body = document.body;
    body.remove();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const reply = vi.fn();
    try {
      fake.listeners[0]({ mode: 'auto' }, {}, reply);
      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
    } finally {
      document.documentElement.append(body);
    }
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(reply.mock.calls[0][0]).toEqual({ ok: false, error: 'Nothing to read was found on this page' });
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('a mount that throws leaves nothing on the page and is reported', async () => {
    const fake = fakeApi();
    const s: Record<PropertyKey, unknown> = { chrome: fake.api, [BRIDGE_KEY]: bridge };
    install(s, window);
    const spy = vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(() => {
      throw new Error('no shadow');
    });
    const reply = vi.fn();
    fake.listeners[0]({ mode: 'auto' }, {}, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalled());
    spy.mockRestore();
    expect(reply.mock.calls[0][0]).toEqual({ ok: false, error: 'no shadow' });
    expect(hostEl()).toBeNull();
    expect((s[READER_KEY] as Reader).current).toBeNull();
  });

  it('opening again does not read the open reader’s own copies', async () => {
    const { reader } = make();
    await reader.open('auto');
    const before = words(reader.current!.doc);
    await reader.open('auto');
    expect(words(reader.current!.doc)).toBe(before);
  });
});

describe('a refused settings write (l-errors-r3)', () => {
  it('still re-mounts on a display change and shows "Settings not saved"', async () => {
    const { reader, raw } = make();
    await reader.open('auto');
    raw.storage.local.set.mockRejectedValue(new Error('Extension context invalidated.'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    (hostEl()!.shadowRoot!.querySelector('.sr-settings-button') as HTMLElement).click();
    const control = hostEl()!.shadowRoot!.querySelector('.sr-settings [name="display"]') as HTMLSelectElement;
    control.value = 'dock';
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(hostEl()?.dataset.display).toBe('dock'));
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('a refused speed change shows the note in the status line', async () => {
    const { reader, raw } = make();
    await reader.open('auto');
    await reader.current!.handle.ready;
    raw.storage.local.set.mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    reader.current!.handle.player.speed(25);
    await vi.waitFor(() => expect(shadow().querySelector('.sr-status [data-note="host"]')?.textContent).toBe('Settings not saved'));
  });
});
