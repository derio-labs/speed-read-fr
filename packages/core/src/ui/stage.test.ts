// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orp } from '../text/orp';
import { ARTICLE, mountHarness } from '../testing/reader';
import { formatDuration } from './format';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Fake layout: widths by class name. */
function stubWidths(widths: Record<string, number>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const cls = Object.keys(widths).find((c) => this.classList.contains(c));
    const width = cls ? widths[cls] : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('chunk steps', () => {
  it('show before/pivot/after spans with the pivot marked', () => {
    const t = mountHarness('<p>The first paragraph has several words. It has two sentences.</p>');
    t.handle.player.toggle();
    const split = orp('The first paragraph');
    expect(t.q('.sr-chunk .sr-before')!.textContent).toBe(split.before);
    expect(t.q('.sr-chunk .sr-pivot')!.textContent).toBe(split.pivot);
    expect(t.q('.sr-chunk .sr-after')!.textContent).toBe(split.after);
    expect(t.q('.sr-display')!.dataset.kind).toBe('chunk');
  });

  it('show the current sentence below with the current chunk emphasised', () => {
    const t = mountHarness('<p>The first paragraph has several words. It has two sentences.</p>');
    t.handle.player.toggle();
    const parts = t.qa('.sr-sentence > span');
    expect(parts.map((p) => p.textContent)).toEqual(['The first paragraph', 'has several words.']);
    expect(parts.map((p) => p.classList.contains('sr-current'))).toEqual([true, false]);
    t.clock.advance(t.clock.nextIn()!);
    expect(t.qa('.sr-sentence > span').map((p) => p.classList.contains('sr-current'))).toEqual([false, true]);
  });

  it('render atoms in a monospace span', () => {
    const t = mountHarness('<p>Install with <code>npm ci</code> first.</p>');
    t.handle.player.toggle();
    expect(t.qa('.sr-chunk .sr-atom').map((a) => a.textContent).join('')).toBe('npm ci');
    expect(text(t.q('.sr-chunk'))).toBe('Install with npm ci');
    expect(t.q('.sr-sentence .sr-atom')!.textContent).toBe('npm ci');
  });

  it('keep the pivot on the axis by shifting the chunk by the width before it', () => {
    const t = mountHarness('<p>The first paragraph has several words.</p>');
    // jsdom has no layout: the shift falls back to 0 and is still set.
    t.handle.player.toggle();
    expect(t.q('.sr-chunk')!.style.getPropertyValue('--sr-shift')).toBe('0px');
  });
});

/**
 * Fake layout for the ribbon: a character is 10px, a row is 400px wide and 40px tall, and a word's left
 * edge follows the text before it in its line.
 */
function stubRibbonLayout() {
  const left = (el: Element) => {
    let x = 0;
    for (const sibling of Array.from(el.parentElement?.childNodes ?? [])) {
      if (sibling === el) break;
      x += (sibling.textContent ?? '').length * 10;
    }
    return x;
  };
  const rect = (x: number, width: number, height = 0) => ({ width, height, top: 0, left: x, right: x + width, bottom: height, x, y: 0, toJSON() {} }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('sr-ribbon-row')) return rect(0, 400, 40);
    if (this.classList.contains('sr-ribbon-line')) return rect(0, (this.textContent ?? '').length * 10);
    if (this.classList.contains('sr-w')) return rect(left(this), (this.textContent ?? '').length * 10);
    return rect(0, 0);
  });
  (Range.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = function (this: Range) {
    const word = this.startContainer.parentElement!.closest('.sr-w')!;
    return rect(left(word) + this.startOffset * 10, (this.endOffset - this.startOffset) * 10);
  };
}

const flowOpts = { readingMode: 'flow' as const };
const rowText = (t: ReturnType<typeof mountHarness>, position: string) => text(t.q(`.sr-ribbon-row[data-position="${position}"]`));
const ribbonVar = (t: ReturnType<typeof mountHarness>, name: string) => t.q('.sr-ribbon')!.style.getPropertyValue(name);

describe('flow mode ribbon', () => {
  afterEach(() => {
    delete (Range.prototype as unknown as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  });

  it('renders three row viewports over one line of consecutive words, with no focus axis', () => {
    const t = mountHarness('<p>alpha beta gamma delta epsilon zeta.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(t.qa('.sr-ribbon-row').map((r) => r.dataset.position)).toEqual(['top', 'middle', 'bottom']);
    for (const position of ['top', 'middle', 'bottom']) expect(rowText(t, position)).toBe('alpha beta gamma delta epsilon zeta.');
    expect(t.qa('.sr-ribbon-row[data-position="middle"] .sr-w')).toHaveLength(6);
    expect(t.q('.sr-flow-axis')).toBeNull();
    expect(t.q('.sr-flow-row')).toBeNull();
  });

  it('sets the middle letter of the current word in the accent class, once', () => {
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(t.qa('.sr-flow-mid').map((e) => e.textContent)).toEqual(['p']);
    expect(t.q('.sr-flow-mid')!.closest('.sr-w')!.textContent).toBe('alpha');
    expect(t.q('.sr-flow-mid')!.closest('.sr-ribbon-row')!.getAttribute('data-position')).toBe('middle');
    t.clock.advance(t.clock.nextIn()!);
    expect(t.qa('.sr-flow-mid').map((e) => e.textContent)).toEqual(['e']);
    expect(rowText(t, 'middle')).toBe('alpha beta gamma.');
  });

  it('sizes the braced target to the current word plus 8px and keeps top and bottom braces', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    const target = t.q('.sr-flow-target')!;
    expect(target.querySelector('.sr-flow-brace[data-side="top"]')).not.toBeNull();
    expect(target.querySelector('.sr-flow-brace[data-side="bottom"]')).not.toBeNull();
    expect(target.hidden).toBe(false);
    expect(target.style.getPropertyValue('--sr-target-w')).toBe('58'); // alpha: 5 chars
    t.clock.advance(t.clock.nextIn()!);
    expect(target.style.getPropertyValue('--sr-target-w')).toBe('48'); // beta
    t.clock.advance(t.clock.nextIn()!);
    expect(target.style.getPropertyValue('--sr-target-w')).toBe('68'); // gamma.
  });

  it('puts the middle letter on the shared offset and the target left of it by the letters before', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    // alpha 0..50, middle 'p' centre 25; the row is 400 wide so its centre is 200.
    expect(ribbonVar(t, '--sr-x')).toBe('25');
    expect(ribbonVar(t, '--sr-w')).toBe('400');
    expect(t.q('.sr-flow-target')!.style.getPropertyValue('--sr-target-x')).toBe(String(200 - 25 - 4));
    t.clock.advance(t.clock.nextIn()!);
    // beta starts at 60; its middle 'e' is the second letter, centre 60 + 15
    expect(ribbonVar(t, '--sr-x')).toBe('75');
    expect(t.q('.sr-flow-target')!.style.getPropertyValue('--sr-target-x')).toBe(String(200 - 15 - 4));
  });

  it('glides for a third of a word, snaps on the first layout, and snaps for a move over a row width', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>' + Array.from({ length: 40 }, () => 'word').join(' ') + '.</p>', { settings: { ...flowOpts, wpm: 300 } });
    t.handle.player.toggle();
    expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
    t.clock.advance(t.clock.nextIn()!);
    expect(Number.parseFloat(ribbonVar(t, '--sr-glide'))).toBeCloseTo(200 / 3);
    t.handle.player.scrub(20);
    expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
    t.handle.player.scrub(-1);
    expect(Number.parseFloat(ribbonVar(t, '--sr-glide'))).toBeCloseTo(200 / 3);
  });

  it('snaps under reduced motion', () => {
    stubRibbonLayout();
    const win = window as unknown as { matchMedia?: unknown };
    win.matchMedia = (query: string) => ({ matches: query.includes('reduce'), media: query });
    try {
      const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
      t.handle.player.toggle();
      t.clock.advance(t.clock.nextIn()!);
      expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
    } finally {
      delete win.matchMedia;
    }
  });

  it('scrubbing moves the offset word by word and back', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma delta.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    t.handle.player.scrub(2);
    expect(t.q('.sr-flow-mid')!.closest('.sr-w')!.textContent).toBe('gamma');
    expect(ribbonVar(t, '--sr-x')).toBe(String(110 + 20 + 5));
    t.handle.player.scrub(-1);
    expect(t.q('.sr-flow-mid')!.closest('.sr-w')!.textContent).toBe('beta');
    expect(ribbonVar(t, '--sr-x')).toBe('75');
  });

  it('lays out at most 400 words around the position and lays out again near the window edge', () => {
    const body = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' ') + '.';
    stubRibbonLayout();
    const t = mountHarness(`<p>${body}</p>`, { settings: flowOpts });
    t.handle.player.toggle();
    const ids = () => t.qa('.sr-ribbon-row[data-position="middle"] .sr-w').map((w) => w.textContent);
    expect(ids()).toHaveLength(400);
    expect(ids()[0]).toBe('w0');
    t.handle.player.scrub(250);
    expect(ids()[0]).toBe('w0');
    t.handle.player.scrub(49);
    expect(ids()[0]).toBe('w0');
    t.handle.player.scrub(1);
    expect(t.q('.sr-flow-mid')!.closest('.sr-w')!.textContent).toBe('w300');
    expect(ids()[0]).toBe('w100');
    // The re-centring step glides like any other.
    expect(Number.parseFloat(t.q('.sr-ribbon')!.style.getPropertyValue('--sr-glide'))).toBeGreaterThan(0);
    expect(ids()).toHaveLength(400);
  });

  it('lays a list out as one line with a bullet between the items', () => {
    const t = mountHarness('<ul><li>first list item that is rather long indeed</li><li>second list item that is also long</li><li>third list item with plenty of words too</li></ul>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(rowText(t, 'middle')).toContain('indeed • second');
    expect(rowText(t, 'middle')).toContain('long • third');
    expect(t.qa('.sr-ribbon-row[data-position="middle"] .sr-ribbon-sep')).toHaveLength(2);
  });

  it('puts a chapter card in place of the ribbon and takes the ribbon up again after it', () => {
    const t = mountHarness('<p>alpha beta.</p><h1>Heading</h1><p>gamma delta.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(rowText(t, 'middle')).toBe('alpha beta.');
    for (let i = 0; i < 4 && !t.q('.sr-card-chapter'); i++) t.clock.advance(t.clock.nextIn()!);
    expect(t.q('.sr-card-chapter')).not.toBeNull();
    expect(t.q('.sr-ribbon')).toBeNull();
    t.handle.player.continue();
    expect(rowText(t, 'middle')).toBe('gamma delta.');
  });

  it('does not borrow words from across a code stop', () => {
    const t = mountHarness('<p>alpha beta.</p><pre>code</pre><p>gamma delta.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    t.handle.player.continue();
    t.clock.advance(t.clock.nextIn()!);
    expect(rowText(t, 'middle')).toBe('alpha beta.');
    for (let i = 0; i < 20 && !rowText(t, 'middle').startsWith('gamma'); i++) {
      if (t.q('.sr-card-stop')) t.handle.player.continue();
      else t.clock.advance(t.clock.nextIn()!);
    }
    expect(rowText(t, 'middle')).toBe('gamma delta.');
    expect(t.q('.sr-card-stop')).toBeNull();
  });

  it('keeps chapter and structured-content cards instead of the ribbon', () => {
    const t = mountHarness('<h1>Heading</h1><p>Text before code.</p><pre>const x = 1;</pre>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(t.q('.sr-card-chapter')).not.toBeNull();
    expect(t.q('.sr-ribbon')).toBeNull();
    t.handle.player.continue();
    t.clock.advance(10_000);
    expect(t.q('.sr-card-stop')).not.toBeNull();
    expect(t.q('.sr-ribbon')).toBeNull();
  });

  it('sets data-reading-mode on the reader, following the setting', () => {
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    expect(t.reader.dataset.readingMode).toBe('flow');
    t.q<HTMLButtonElement>('.sr-settings-button')!.click();
    const select = t.q<HTMLSelectElement>('.sr-settings [name="readingMode"]')!;
    select.value = 'chunk';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.reader.dataset.readingMode).toBe('chunk');
    select.value = 'flow';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.reader.dataset.readingMode).toBe('flow');
  });

  it('renders atoms in a monospace span on the ribbon', () => {
    const t = mountHarness('<p>Run <code>npm ci</code> now.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(t.qa('.sr-ribbon-row[data-position="middle"] .sr-atom').map((a) => a.textContent)).toEqual(['npm ci']);
    // Reaching the atom keeps it one box with the lit letter inside, so nothing shifts.
    t.clock.advance(t.clock.nextIn()!);
    const atoms = t.qa('.sr-ribbon-row[data-position="middle"] .sr-atom');
    expect(atoms).toHaveLength(1);
    expect(atoms[0].querySelector('.sr-flow-mid')!.textContent).toBe('m');
  });
});

describe('bottom-stage flow', () => {
  it('keeps the ribbon in the stage and the card in the details panel', () => {
    const t = mountHarness('<h1>Heading</h1><p>alpha beta gamma.</p><pre>const x = 1;</pre>', { bottomStage: true, settings: flowOpts });
    expect(t.reader.hasAttribute('data-bottom-stage')).toBe(true);
    t.handle.player.toggle();
    const details = t.q('.sr-stage-details')!;
    expect(details.hidden).toBe(false);
    expect(details.querySelector('.sr-card-chapter')).not.toBeNull();
    t.handle.player.continue();
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(t.qa('.sr-display .sr-ribbon-row')).toHaveLength(3);
    expect(t.q('.sr-display .sr-flow-target')).not.toBeNull();
    expect(details.hidden).toBe(true);
    expect(details.childNodes).toHaveLength(0);
    t.clock.advance(10_000);
    expect(details.hidden).toBe(false);
    expect(details.querySelector('.sr-card-stop')).not.toBeNull();
    expect(t.q('.sr-ribbon')).toBeNull();
  });
});

describe('fitting the chunk to the stage', () => {
  it('scales no smaller than 0.5 and wraps past that', () => {
    stubWidths({ 'sr-display': 360, 'sr-chunk': 1400, 'sr-before': 600, 'sr-pivot': 20 });
    const t = mountHarness('<p>Supercalifragilisticexpialidocious_and_more_and_more_and_more_characters_here.</p>');
    t.handle.player.toggle();
    const display = t.q('.sr-display')!;
    expect(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale')).toBe('0.500');
    expect(display.dataset.wrap).toBe('true');
  });

  it('does not wrap a chunk that fits once scaled', () => {
    stubWidths({ 'sr-display': 400, 'sr-chunk': 300, 'sr-before': 250, 'sr-pivot': 20 });
    const t = mountHarness('<p>Some words here.</p>');
    t.handle.player.toggle();
    expect(t.q('.sr-display')!.dataset.wrap).toBeUndefined();
    expect(Number(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale'))).toBeGreaterThan(0.5);
  });

  it('counts the list depth offset in the fit', () => {
    // axis = 400 * 0.45 = 180, +28 for depth 1; right room 400 - 208 - 12 = 180 < 200 to the right of the pivot.
    stubWidths({ 'sr-display': 400, 'sr-chunk': 300, 'sr-before': 90, 'sr-pivot': 20 });
    const t = mountHarness(
      '<ul><li>first list item that is rather long indeed</li><li>second list item that is also long<ul><li>nested item in the list here</li></ul></li></ul>',
    );
    const list = t.doc.sections[0].blocks[0];
    if (list.kind !== 'list') throw new Error('list expected');
    t.handle.player.jumpToBlock(list.items[2].source);
    expect(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale')).toBe('0.900');
  });

  it('aligns again when the stage is resized, and stops observing on destroy', () => {
    const observers: { cb: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn();
        constructor(public cb: () => void) {
          observers.push(this);
        }
        observe() {}
      },
    );
    stubWidths({ 'sr-display': 1000, 'sr-chunk': 300, 'sr-before': 100, 'sr-pivot': 20 });
    const t = mountHarness('<p>Some words here and more.</p>');
    t.handle.player.toggle();
    t.handle.player.toggle();
    const chunk = t.q('.sr-chunk')!;
    expect(chunk.style.getPropertyValue('--sr-scale')).toBe('');
    stubWidths({ 'sr-display': 300, 'sr-chunk': 300, 'sr-before': 100, 'sr-pivot': 20 });
    for (const o of observers) o.cb();
    expect(chunk.style.getPropertyValue('--sr-scale')).not.toBe('');
    t.handle.destroy();
    expect(observers.some((o) => o.disconnect.mock.calls.length > 0)).toBe(true);
  });
});

describe('list steps', () => {
  const LIST =
    '<ul><li>first list item that is rather long indeed</li><li>second list item that is also long<ul><li>nested item in the list here</li></ul></li></ul>';

  it('item-chunk shows item i/n and indentation by depth', () => {
    const t = mountHarness(LIST);
    t.handle.player.toggle();
    expect(t.q('.sr-display')!.dataset.kind).toBe('item-chunk');
    expect(text(t.q('.sr-item-counter'))).toBe('item 1/2');
    expect(t.q('.sr-display')!.style.getPropertyValue('--sr-depth')).toBe('0');
    const nested = t.doc.sections[0].blocks[0];
    if (nested.kind !== 'list') throw new Error('list expected');
    t.handle.player.jumpToBlock(nested.items[2].source);
    expect(text(t.q('.sr-item-counter'))).toBe('item 1/1');
    expect(t.q('.sr-display')!.style.getPropertyValue('--sr-depth')).toBe('1');
  });

  it('list-whole shows every item', () => {
    const t = mountHarness('<ul><li>apples</li><li>pears<ul><li>green</li></ul></li></ul>');
    t.handle.player.toggle();
    const items = t.qa('.sr-list-whole li');
    expect(items.map((li) => li.textContent)).toEqual(['apples', 'pears', 'green']);
    expect(items[2].style.getPropertyValue('--sr-depth')).toBe('1');
  });
});

describe('cards', () => {
  it('chapter shows title, words, estimated time, summary and sub-headings', () => {
    const t = mountHarness(ARTICLE);
    t.handle.player.toggle();
    const card = t.q('.sr-card-chapter')!;
    expect(text(card.querySelector('.sr-card-title'))).toBe('Guide');
    expect(text(card.querySelector('.sr-card-meta'))).toMatch(/^\d+ words · \d+ (s|min)$/);
    expect(text(card.querySelector('.sr-card-summary'))).toBe('1 paragraph');
    expect(t.qa('.sr-card-subs li').map((li) => li.textContent)).toEqual(['Setup', 'Usage']);
    expect(text(card)).toContain('Space');
  });

  it('chapter titles are written as text', () => {
    const t = mountHarness('<h1>&lt;img src=x onerror="alert(1)"&gt; Title</h1><p>Body.</p>');
    t.handle.player.toggle();
    expect(text(t.q('.sr-card-title'))).toBe('<img src=x onerror="alert(1)"> Title');
    expect(t.reader.querySelector('img')).toBeNull();
  });

  it('title steps show the heading', () => {
    const t = mountHarness('<h3>Minor</h3><p>Body.</p>');
    t.handle.player.toggle();
    expect(text(t.q('.sr-card-title-step .sr-card-title'))).toBe('Minor');
  });

  it('stop shows the prompt', () => {
    const t = mountHarness('<p>Intro.</p><pre>a\nb</pre><p>After.</p>');
    t.handle.player.toggle();
    t.clock.advance(10_000);
    expect(t.handle.player.state).toBe('stopped');
    const card = t.q('.sr-card-stop')!;
    expect(text(card)).toContain('Code, 2 lines');
    expect(text(card)).toContain('Space to continue, E to expand');
  });

  it('the end card shows words and time', () => {
    const t = mountHarness('<p>One two.</p>');
    t.handle.player.toggle();
    t.clock.advance(10_000);
    const card = t.q('.sr-card-end')!;
    expect(text(card)).toContain('2 words');
    expect(text(card)).toMatch(/\d+ s/);
  });

  it('shows a ready card before playback starts', () => {
    const t = mountHarness(ARTICLE);
    const card = t.q('.sr-card-ready')!;
    expect(text(card.querySelector('.sr-card-title'))).toBe('Guide');
    expect(text(card)).toContain('Space');
  });
});

describe('an empty document', () => {
  it('shows an empty state, never an end card, with the status Ready', () => {
    const t = mountHarness('');
    expect(text(t.q('.sr-card-empty'))).toContain('Nothing to read here');
    t.handle.player.toggle();
    expect(t.q('.sr-card-end')).toBeNull();
    expect(text(t.q('.sr-card-empty'))).toContain('Nothing to read here');
    expect(text(t.q('.sr-status-state'))).toBe('Ready');
  });
});

describe('status line', () => {
  it('shows WPM, state and overall progress', () => {
    const t = mountHarness('<p>One two three four five six seven eight nine ten.</p>', { settings: { chunkWords: 2 } });
    expect(text(t.q('.sr-status'))).toBe('300 WPM · Ready · 0%');
    t.handle.player.toggle();
    t.clock.advance(t.clock.nextIn()!);
    expect(text(t.q('.sr-status'))).toBe('300 WPM · Playing · 20%');
    t.handle.player.toggle();
    t.handle.player.speed(25);
    expect(text(t.q('.sr-status'))).toBe('325 WPM · Paused · 20%');
  });
});

describe('formatDuration', () => {
  it('rounds to seconds under a minute and to minutes above', () => {
    expect(formatDuration(400)).toBe('1 s');
    expect(formatDuration(42_000)).toBe('42 s');
    expect(formatDuration(150_000)).toBe('3 min');
  });
});
