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

describe('three-row flow steps', () => {
  it('keeps exactly three rows and advances the current text through the middle row', () => {
    const t = mountHarness('<p>alpha beta gamma delta epsilon zeta.</p>', { settings: { readingMode: 'flow', chunkWords: 1 } });
    t.handle.player.toggle();
    const rows = () => t.qa('.sr-flow-row');
    const middle = () => text(t.q('.sr-flow-row[data-position="middle"]'));
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(rows()).toHaveLength(3);
    const first = middle();
    t.clock.advance(t.clock.nextIn()!);
    expect(rows()).toHaveLength(3);
    expect(middle()).not.toBe(first);
    expect(text(rows()[0])).toBe(first);
  });

  it('keeps the focus marker fixed when reading a nested list item', () => {
    const t = mountHarness('<ul><li>first list item that is rather long indeed</li><li>second list item that is also long<ul><li>nested target words in the list</li></ul></li></ul>', { settings: { readingMode: 'flow' } });
    t.handle.player.toggle();
    const list = t.doc.sections[0].blocks[0];
    if (list.kind !== 'list') throw new Error('list expected');
    t.handle.player.jumpToBlock(list.items[2].source);
    expect(t.q('.sr-flow-axis')).not.toBeNull();
    expect(t.q('.sr-flow-axis')!.style.left).toBe('50%');
    expect(t.q('.sr-display')!.style.getPropertyValue('--sr-depth')).toBe('');
  });

  it('re-centers the flow window after a sentence jump', () => {
    const t = mountHarness('<p>First sentence has words. Second sentence has other words.</p>', { settings: { readingMode: 'flow', chunkWords: 1 } });
    t.handle.player.toggle();
    t.handle.player.sentence(1);
    expect(text(t.q('.sr-flow-row[data-position="middle"]'))).toBe('Second');
  });

  it('keeps the space between the pivot and the rest of the middle row', () => {
    const t = mountHarness('<p>read it all in one go.</p>', { settings: { readingMode: 'flow', chunkWords: 3 } });
    t.handle.player.toggle();
    const middle = t.q('.sr-flow-row[data-position="middle"]')!;
    expect(middle.textContent).toBe('read it all');
    const parts = ['.sr-flow-before', '.sr-flow-pivot', '.sr-flow-after'].map((s) => t.q(s)!.textContent!);
    expect(parts.join('')).toBe('read it all');
    expect(parts.filter((x) => x.startsWith(' ') || x.endsWith(' ')).length).toBeGreaterThan(0);
  });

  it('leaves the top row empty on the first chunk and the bottom row empty on the last, still three rows', () => {
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: { readingMode: 'flow', chunkWords: 1 } });
    t.handle.player.toggle();
    expect(t.qa('.sr-flow-row')).toHaveLength(3);
    expect(text(t.q('.sr-flow-row[data-position="top"]'))).toBe('');
    expect(text(t.q('.sr-flow-row[data-position="bottom"]'))).toBe('beta');
    t.clock.advance(t.clock.nextIn()!);
    t.clock.advance(t.clock.nextIn()!);
    expect(text(t.q('.sr-flow-row[data-position="middle"]'))).toBe('gamma.');
    expect(t.qa('.sr-flow-row')).toHaveLength(3);
    expect(text(t.q('.sr-flow-row[data-position="bottom"]'))).toBe('');
    expect(text(t.q('.sr-flow-row[data-position="top"]'))).toBe('beta');
  });

  it('takes the neighbour across an item gap', () => {
    const t = mountHarness('<ul><li>first list item that is rather long indeed</li><li>second list item that is also long</li><li>third list item with plenty of words too</li></ul>', { settings: { readingMode: 'flow' } });
    t.handle.player.toggle();
    const list = t.doc.sections[0].blocks[0];
    if (list.kind !== 'list') throw new Error('list expected');
    t.handle.player.jumpToBlock(list.items[1].source);
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(t.qa('.sr-flow-row')).toHaveLength(3);
    expect(text(t.q('.sr-flow-row[data-position="middle"]'))).toMatch(/^second/);
    expect(text(t.q('.sr-flow-row[data-position="top"]'))).not.toBe('');
  });

  it('does not borrow a neighbour from across a card', () => {
    const t = mountHarness('<p>alpha beta.</p><pre>code</pre><p>gamma delta.</p>', { settings: { readingMode: 'flow', chunkWords: 1 } });
    t.handle.player.toggle();
    t.handle.player.continue();
    const row = (pos: string) => text(t.q(`.sr-flow-row[data-position="${pos}"]`));
    t.clock.advance(t.clock.nextIn()!);
    expect(row('middle')).toBe('beta.');
    expect(row('bottom')).toBe('');
    expect(t.qa('.sr-flow-row')).toHaveLength(3);
    for (let i = 0; i < 20 && row('middle') !== 'gamma'; i++) {
      if (t.q('.sr-card-stop')) t.handle.player.continue();
      else t.clock.advance(t.clock.nextIn()!);
    }
    expect(row('middle')).toBe('gamma');
    expect(row('top')).toBe('');
    expect(t.qa('.sr-flow-row')).toHaveLength(3);
  });

  it('keeps chapter and structured-content cards instead of replacing them with rows', () => {
    const t = mountHarness('<h1>Heading</h1><p>Text before code.</p><pre>const x = 1;</pre>', { settings: { readingMode: 'flow' } });
    t.handle.player.toggle();
    expect(t.q('.sr-card-chapter')).not.toBeNull();
    expect(t.q('.sr-flow-row')).toBeNull();
    t.handle.player.continue();
    t.clock.advance(10_000);
    expect(t.q('.sr-card-stop')).not.toBeNull();
    expect(t.q('.sr-flow-row')).toBeNull();
  });
});

describe('bottom-stage flow', () => {
  it('keeps the flow structure in the stage and the card in the details panel', () => {
    const t = mountHarness('<h1>Heading</h1><p>alpha beta gamma.</p><pre>const x = 1;</pre>', { bottomStage: true, settings: { readingMode: 'flow', chunkWords: 1 } });
    expect(t.reader.hasAttribute('data-bottom-stage')).toBe(true);
    t.handle.player.toggle();
    const details = t.q('.sr-stage-details')!;
    expect(details.hidden).toBe(false);
    expect(details.querySelector('.sr-card-chapter')).not.toBeNull();
    t.handle.player.continue();
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(t.qa('.sr-display .sr-flow-row')).toHaveLength(3);
    expect(t.q('.sr-display .sr-flow-axis')).not.toBeNull();
    expect(details.hidden).toBe(true);
    expect(details.childNodes).toHaveLength(0);
    t.clock.advance(10_000);
    expect(details.hidden).toBe(false);
    expect(details.querySelector('.sr-card-stop')).not.toBeNull();
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
