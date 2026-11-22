// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orp } from '../text/orp';
import { ARTICLE, mountHarness, chunkSettings } from '../testing/reader';
import { fakeSpeech, voice } from '../testing/speech';
import { createSpeechDriver } from '../tts';
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
    const t = mountHarness('<p>The first paragraph has several words. It has two sentences.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    const split = orp('The first paragraph');
    expect(t.q('.sr-chunk .sr-before')!.textContent).toBe(split.before);
    expect(t.q('.sr-chunk .sr-pivot')!.textContent).toBe(split.pivot);
    expect(t.q('.sr-chunk .sr-after')!.textContent).toBe(split.after);
    expect(t.q('.sr-display')!.dataset.kind).toBe('chunk');
  });

  it('show the current sentence below with the current chunk emphasised', () => {
    const t = mountHarness('<p>The first paragraph has several words. It has two sentences.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    const parts = t.qa('.sr-sentence > span');
    expect(parts.map((p) => p.textContent)).toEqual(['The first paragraph', 'has several words.']);
    expect(parts.map((p) => p.classList.contains('sr-current'))).toEqual([true, false]);
    t.clock.advance(t.clock.nextIn()!);
    expect(t.qa('.sr-sentence > span').map((p) => p.classList.contains('sr-current'))).toEqual([false, true]);
  });

  it('render atoms in a monospace span', () => {
    const t = mountHarness('<p>Install with <code>npm ci</code> first.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    expect(t.qa('.sr-chunk .sr-atom').map((a) => a.textContent).join('')).toBe('npm ci');
    expect(text(t.q('.sr-chunk'))).toBe('Install with npm ci');
    expect(t.q('.sr-sentence .sr-atom')!.textContent).toBe('npm ci');
  });

  it('keep the pivot on the axis by shifting the chunk by the width before it', () => {
    const t = mountHarness('<p>The first paragraph has several words.</p>', { settings: chunkSettings });
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
    if (this.classList.contains('sr-ribbon-probe')) return rect(0, (this.textContent ?? '').length * 10);
    if (this.classList.contains('sr-ribbon-line')) return rect(0, (this.textContent ?? '').length * 10);
    if (this.classList.contains('sr-w')) return rect(left(this), (this.textContent ?? '').length * 10);
    return rect(0, 0);
  });
  (Range.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = function (this: Range) {
    const word = this.startContainer.parentElement!.closest('.sr-w')!;
    // The offset of the range's start in the word's text, across the text nodes the first-letter span splits it into.
    const walker = document.createTreeWalker(word, 4 /* SHOW_TEXT */);
    let before = 0;
    for (let node = walker.nextNode(); node && node !== this.startContainer; node = walker.nextNode()) before += (node as Text).data.length;
    return rect(left(word) + (before + this.startOffset) * 10, (this.endOffset - this.startOffset) * 10);
  };
}

const flowOpts = { readingMode: 'flow' as const, flowMotion: 'word' as const };
/** The word on the ribbon's target. */
const current = (t: ReturnType<typeof mountHarness>) => text(t.q('.sr-ribbon-row[data-position="middle"] .sr-w[data-current]'));
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

  it('marks the current word with data-current and colours only the first letter of in-bracket words', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    expect(t.q('.sr-flow-mid')).toBeNull();
    expect(current(t)).toBe('alpha');
    expect(t.qa('.sr-w[data-current]')).toHaveLength(1);
    expect(t.q('.sr-w[data-current]')!.closest('.sr-ribbon-row')!.getAttribute('data-position')).toBe('middle');
    t.clock.advance(t.clock.nextIn()!);
    expect(current(t)).toBe('beta');
    expect(t.qa('.sr-w[data-current]')).toHaveLength(1);
    expect(rowText(t, 'middle')).toBe('alpha beta gamma.');
  });

  describe('red first letter in the bracket', () => {
    const inMarked = (t: ReturnType<typeof mountHarness>) => t.qa('.sr-ribbon-row[data-position="middle"] .sr-w[data-in]').map((w) => text(w));

    it('wraps the first letter of each middle-row word, and only there', () => {
      stubRibbonLayout();
      const t = mountHarness('<p>alpha (Beta) 42nd.</p>', { settings: flowOpts });
      t.handle.player.toggle();
      expect(t.qa('.sr-ribbon-row[data-position="middle"] .sr-w-first').map((e) => e.textContent)).toEqual(['a', 'B', '4']);
      expect(t.qa('.sr-ribbon-row:not([data-position="middle"]) .sr-w-first')).toHaveLength(0);
      expect(t.qa('.sr-w-first').every((e) => e.closest('.sr-w'))).toBe(true);
      expect(rowText(t, 'middle')).toBe('alpha (Beta) 42nd.');
    });

    it('leaves a word with no letter unwrapped', () => {
      stubRibbonLayout();
      const t = mountHarness('<p>alpha \u2014 beta.</p>', { settings: flowOpts });
      t.handle.player.toggle();
      expect(t.qa('.sr-ribbon-row[data-position="middle"] .sr-w-first').map((e) => e.textContent)).toEqual(['a', 'b']);
    });

    it('marks exactly the middle-row words overlapping the bracket after a step, never top or bottom', () => {
      stubRibbonLayout();
      const t = mountHarness('<p>alpha beta gamma delta.</p>', { settings: flowOpts });
      t.handle.player.toggle();
      // x = 25: bracket [100, 300); alpha [175,225), beta [235,275), gamma [285,345) overlap, delta [345,..) does not.
      expect(inMarked(t)).toEqual(['alpha', 'beta', 'gamma']);
      t.clock.advance(t.clock.nextIn()!);
      // x = 75: alpha [125,175), beta .., gamma [235,..), delta [295,..) overlap.
      expect(inMarked(t)).toEqual(['alpha', 'beta', 'gamma', 'delta.']);
      expect(t.qa('.sr-ribbon-row:not([data-position="middle"]) [data-in]')).toHaveLength(0);
    });

    it('re-marks when the focus span changes while paused', () => {
      stubRibbonLayout();
      const t = mountHarness('<p>alpha beta gamma delta.</p>', { settings: flowOpts });
      t.handle.player.toggle();
      t.handle.player.toggle();
      expect(inMarked(t)).toEqual(['alpha', 'beta', 'gamma']);
      t.handle.applySettings({ ...t.handle.player.settings, focusChars: 6 });
      // bracket [170, 230): only alpha [175,225)
      expect(inMarked(t)).toEqual(['alpha']);
    });

    it('re-marks when the stage is laid out again (resize)', () => {
      const observers: { cb: () => void }[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(public cb: () => void) {
            observers.push(this);
          }
          observe() {}
          disconnect() {}
        },
      );
      stubRibbonLayout();
      const t = mountHarness('<p>alpha beta gamma delta.</p>', { settings: flowOpts });
      t.handle.player.toggle();
      t.handle.player.toggle();
      expect(inMarked(t)).toEqual(['alpha', 'beta', 'gamma']);
      // The row gets narrower, 100px: the bracket is clamped to it, [0,100), and the line sits at left = start - 25 + 50.
      vi.restoreAllMocks();
      const rect = (x: number, width: number, height = 0) => ({ width, height, top: 0, left: x, right: x + width, bottom: height, x, y: 0, toJSON() {} }) as DOMRect;
      const left = (el: Element) => {
        let x = 0;
        for (const sibling of Array.from(el.parentElement?.childNodes ?? [])) {
          if (sibling === el) break;
          x += (sibling.textContent ?? '').length * 10;
        }
        return x;
      };
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this.classList.contains('sr-ribbon-row')) return rect(0, 100, 40);
        if (this.classList.contains('sr-ribbon-probe')) return rect(0, (this.textContent ?? '').length * 10);
        if (this.classList.contains('sr-ribbon-line')) return rect(0, (this.textContent ?? '').length * 10);
        if (this.classList.contains('sr-w')) return rect(left(this), (this.textContent ?? '').length * 10);
        return rect(0, 0);
      });
      for (const o of observers) o.cb();
      // alpha [25,75) and beta [85,135) overlap [0,100); gamma [145,..) does not.
      expect(inMarked(t)).toEqual(['alpha', 'beta']);
      expect(t.q('.sr-flow-target')!.style.getPropertyValue('--sr-target-w')).toBe('100');
    });
  });

  it('gives the braced target one fixed width, the focus span in measured characters, for every word and step', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>a extraordinarily alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    const target = t.q('.sr-flow-target')!;
    expect(target.querySelector('.sr-flow-brace[data-side="top"]')).not.toBeNull();
    expect(target.querySelector('.sr-flow-brace[data-side="bottom"]')).not.toBeNull();
    expect(target.hidden).toBe(false);
    for (let i = 0; i < 4; i++) {
      expect(target.style.getPropertyValue('--sr-target-w')).toBe('200'); // 20 characters x 10px
      expect(target.style.getPropertyValue('--sr-target-x')).toBe('100'); // centred on the 400px row
      t.clock.advance(t.clock.nextIn()!);
    }
  });

  it('measures a character as the chunk fit does: the prose sample, not digits (p1-r2)', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    const probe = t.q('.sr-ribbon-probe')!;
    expect(probe.textContent).toBe('the quick brown fox jumps over a lazy dog');
  });

  it('re-sizes the bracket when the focus span changes while paused (p1-r4)', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    t.handle.player.toggle();
    expect(t.handle.player.state).toBe('paused');
    t.handle.applySettings({ ...t.handle.player.settings, focusChars: 10 });
    expect(t.q('.sr-flow-target')!.style.getPropertyValue('--sr-target-w')).toBe('100');
  });

  it('resizes the live bracket when the focus span changes, without a resize event, and clamps it to the row', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    const target = () => t.q('.sr-flow-target')!;
    t.handle.applySettings({ ...t.handle.player.settings, focusChars: 6 });
    expect(target().style.getPropertyValue('--sr-target-w')).toBe('60');
    expect(target().style.getPropertyValue('--sr-target-x')).toBe('170');
    t.handle.applySettings({ ...t.handle.player.settings, focusChars: 40 });
    expect(target().style.getPropertyValue('--sr-target-w')).toBe('400'); // 40 x 10px = the row
    expect(target().style.getPropertyValue('--sr-target-x')).toBe('0');
  });

  it('puts the middle letter on the shared offset and the target left of it by the letters before', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowOpts });
    t.handle.player.toggle();
    // alpha 0..50, middle 'p' centre 25; the row is 400 wide so its centre is 200.
    expect(ribbonVar(t, '--sr-x')).toBe('25');
    expect(ribbonVar(t, '--sr-w')).toBe('400');
    expect(t.q('.sr-flow-target')!.style.getPropertyValue('--sr-target-x')).toBe('100');
    t.clock.advance(t.clock.nextIn()!);
    // beta starts at 60; its middle 'e' is the second letter, centre 60 + 15
    expect(ribbonVar(t, '--sr-x')).toBe('75');
    expect(t.q('.sr-flow-target')!.style.getPropertyValue('--sr-target-x')).toBe('100');
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
    expect(current(t)).toBe('gamma');
    expect(ribbonVar(t, '--sr-x')).toBe(String(110 + 20 + 5));
    t.handle.player.scrub(-1);
    expect(current(t)).toBe('beta');
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
    expect(current(t)).toBe('w300');
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
    // Reaching the atom keeps it one box, marked as the current word, with only its first letter set apart inside.
    t.clock.advance(t.clock.nextIn()!);
    const atoms = t.qa('.sr-ribbon-row[data-position="middle"] .sr-atom');
    expect(atoms).toHaveLength(1);
    expect(current(t)).toBe('npm ci');
    expect([...atoms[0].children].map((c) => c.className)).toEqual(['sr-w-first']);
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
    const t = mountHarness('<p>Supercalifragilisticexpialidocious_and_more_and_more_and_more_characters_here.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    const display = t.q('.sr-display')!;
    expect(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale')).toBe('0.500');
    expect(display.dataset.wrap).toBe('true');
  });

  it('does not wrap a chunk that fits once scaled', () => {
    stubWidths({ 'sr-display': 400, 'sr-chunk': 300, 'sr-before': 250, 'sr-pivot': 20 });
    const t = mountHarness('<p>Some words here.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    expect(t.q('.sr-display')!.dataset.wrap).toBeUndefined();
    expect(Number(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale'))).toBeGreaterThan(0.5);
  });

  it('counts the list depth offset in the fit', () => {
    // axis = 400 * 0.45 = 180, +28 for depth 1; right room 400 - 208 - 12 = 180 < 200 to the right of the pivot.
    stubWidths({ 'sr-display': 400, 'sr-chunk': 300, 'sr-before': 90, 'sr-pivot': 20 });
    const t = mountHarness(
      '<ul><li>first list item that is rather long indeed</li><li>second list item that is also long<ul><li>nested item in the list here</li></ul></li></ul>',
      { settings: chunkSettings },
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
    const t = mountHarness('<p>Some words here and more.</p>', { settings: chunkSettings });
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
    const t = mountHarness(LIST, { settings: chunkSettings });
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
    const t = mountHarness('<ul><li>apples</li><li>pears<ul><li>green</li></ul></li></ul>', { settings: chunkSettings });
    t.handle.player.toggle();
    const items = t.qa('.sr-list-whole li');
    expect(items.map((li) => li.textContent)).toEqual(['apples', 'pears', 'green']);
    expect(items[2].style.getPropertyValue('--sr-depth')).toBe('1');
  });
});

describe('cards', () => {
  it('chapter shows title, words, estimated time, summary and sub-headings', () => {
    const t = mountHarness(ARTICLE, { settings: chunkSettings });
    t.handle.player.toggle();
    const card = t.q('.sr-card-chapter')!;
    expect(text(card.querySelector('.sr-card-title'))).toBe('Guide');
    expect(text(card.querySelector('.sr-card-meta'))).toMatch(/^\d+ words · \d+ (s|min)$/);
    expect(text(card.querySelector('.sr-card-summary'))).toBe('1 paragraph');
    expect(t.qa('.sr-card-subs li').map((li) => li.textContent)).toEqual(['Setup', 'Usage']);
    expect(text(card)).toContain('Space');
  });

  it('chapter titles are written as text', () => {
    const t = mountHarness('<h1>&lt;img src=x onerror="alert(1)"&gt; Title</h1><p>Body.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    expect(text(t.q('.sr-card-title'))).toBe('<img src=x onerror="alert(1)"> Title');
    expect(t.reader.querySelector('img')).toBeNull();
  });

  it('title steps show the heading', () => {
    const t = mountHarness('<h3>Minor</h3><p>Body.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    expect(text(t.q('.sr-card-title-step .sr-card-title'))).toBe('Minor');
  });

  it('stop shows the prompt', () => {
    const t = mountHarness('<p>Intro.</p><pre>a\nb</pre><p>After.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    t.clock.advance(10_000);
    expect(t.handle.player.state).toBe('stopped');
    const card = t.q('.sr-card-stop')!;
    expect(text(card)).toContain('Code, 2 lines');
    expect(text(card)).toContain('Space to continue, E to expand');
  });

  it('the end card shows words and time', () => {
    const t = mountHarness('<p>One two.</p>', { settings: chunkSettings });
    t.handle.player.toggle();
    t.clock.advance(10_000);
    const card = t.q('.sr-card-end')!;
    expect(text(card)).toContain('2 words');
    expect(text(card)).toMatch(/\d+ s/);
  });

  it('shows a ready card before playback starts', () => {
    const t = mountHarness(ARTICLE, { settings: chunkSettings });
    const card = t.q('.sr-card-ready')!;
    expect(text(card.querySelector('.sr-card-title'))).toBe('Guide');
    expect(text(card)).toContain('Space');
  });
});

describe('an empty document', () => {
  it('shows an empty state, never an end card, with the status Ready', () => {
    const t = mountHarness('', { settings: chunkSettings });
    expect(text(t.q('.sr-card-empty'))).toContain('Nothing to read here');
    t.handle.player.toggle();
    expect(t.q('.sr-card-end')).toBeNull();
    expect(text(t.q('.sr-card-empty'))).toContain('Nothing to read here');
    expect(text(t.q('.sr-status-state'))).toBe('Ready');
  });
});

describe('status line', () => {
  it('shows WPM, state and overall progress', () => {
    const t = mountHarness('<p>One two three four five six seven eight nine ten.</p>', { settings: { ...chunkSettings, chunkWords: 2 } });
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

describe('inline exhibit stops in flow mode', () => {
  const LONG = 'first_long_identifier_name_here';
  const HTML = `<p>Call <code>${LONG}</code> then go on.</p>`;
  const flow = { readingMode: 'flow' as const };
  const runToStop = (t: ReturnType<typeof mountHarness>) => {
    for (let i = 0; i < 50 && t.handle.player.state === 'playing'; i++) t.clock.advance(t.clock.nextIn() ?? 0);
  };

  it('keeps the ribbon with the chip on the target and the prompt in the details panel', () => {
    const t = mountHarness(HTML, { bottomStage: true, settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    expect(t.handle.player.state).toBe('stopped');
    expect(t.q('.sr-display')!.dataset.kind).toBe('flow');
    expect(t.q('.sr-ribbon')).not.toBeNull();
    expect(current(t)).toBe('⟨code 1⟩');
    const details = t.q('.sr-stage-details')!;
    expect(details.hidden).toBe(false);
    expect(details.querySelector('.sr-card-stop')).not.toBeNull();
    expect(text(details)).toContain('Space to continue');
    t.handle.player.continue();
    expect(details.hidden).toBe(true);
    expect(details.childNodes).toHaveLength(0);
    expect(current(t)).toBe('then');
  });

  it('titles the stop card with the chip number', () => {
    const t = mountHarness(`<p>Call <code>${LONG}</code> and <code>${LONG}_2</code> now.</p>`, { bottomStage: true, settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.continue();
    runToStop(t);
    expect(text(t.q('.sr-stage-details .sr-card-title'))).toBe('Code 2');
  });

  it('puts the prompt in the status line on a reader without a details panel', () => {
    const t = mountHarness(HTML, { settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    expect(t.q('.sr-ribbon')).not.toBeNull();
    expect(t.q('.sr-card-stop')).toBeNull();
    expect(text(t.q('.sr-status'))).toContain('Space to continue');
    t.handle.player.continue();
    expect(text(t.q('.sr-status'))).not.toContain('Space to continue');
  });

  it('shows a dwell prompt beside the ribbon too', () => {
    const t = mountHarness(HTML, { bottomStage: true, settings: { ...flow, code: { mode: 'dwell', dwellSeconds: 4 } } });
    t.handle.player.toggle();
    for (let i = 0; i < 2; i++) t.clock.advance(t.clock.nextIn() ?? 0);
    expect(t.q('.sr-stage-details .sr-card-dwell')).not.toBeNull();
    expect(t.q('.sr-ribbon')).not.toBeNull();
  });
});

describe('WPM stepper', () => {
  const HTML = '<p>One two three four five six seven eight nine ten.</p>';
  const wheel = (el: Element, init: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(event);
    return event;
  };
  const press = (t: ReturnType<typeof mountHarness>, label: 'Slower' | 'Faster') => t.q<HTMLButtonElement>(`.sr-wpm-step[aria-label="${label}"]`)!.click();
  const modes = [
    ['chunk', chunkSettings],
    ['flow', { readingMode: 'flow' as const }],
  ] as const;

  for (const [mode, settings] of modes) {
    describe(`in ${mode} mode`, () => {
      it('has Slower and Faster buttons around the WPM readout, first in the status line', () => {
        const t = mountHarness(HTML, { settings });
        const group = t.q('.sr-status')!.firstElementChild!;
        expect(group.className).toBe('sr-wpm');
        expect([...group.children].map((c) => c.className)).toEqual(['sr-wpm-step', 'sr-status-wpm', 'sr-wpm-step']);
        expect([...group.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Slower', 'Faster']);
        expect([...group.querySelectorAll('button')].map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '-1']);
        expect(text(t.q('.sr-status'))).toBe('300 WPM · Ready · 0%');
      });

      it('changes the speed by 25 WPM a press, within 100-1000, saving it and keeping playback going', () => {
        const t = mountHarness(HTML, { settings });
        t.handle.player.toggle();
        press(t, 'Faster');
        expect(t.handle.player.settings.wpm).toBe(325);
        expect(text(t.q('.sr-status-wpm'))).toBe('325 WPM');
        press(t, 'Slower');
        press(t, 'Slower');
        expect(t.handle.player.settings.wpm).toBe(275);
        expect(t.handle.player.state).toBe('playing');
        expect(t.store.save).toHaveBeenLastCalledWith(expect.objectContaining({ wpm: 275 }));
        t.handle.player.setSpeed(100);
        press(t, 'Slower');
        expect(t.handle.player.settings.wpm).toBe(100);
        t.handle.player.setSpeed(1000);
        press(t, 'Faster');
        expect(t.handle.player.settings.wpm).toBe(1000);
      });

      it('steps one notch of the wheel (up faster, down slower), and prevents the page from scrolling', () => {
        const t = mountHarness(HTML, { settings });
        const readout = t.q('.sr-wpm')!;
        expect(wheel(readout, { deltaY: -100 }).defaultPrevented).toBe(true);
        expect(t.handle.player.settings.wpm).toBe(325);
        wheel(readout, { deltaY: 100 });
        wheel(readout, { deltaY: 100 });
        expect(t.handle.player.settings.wpm).toBe(275);
      });
    });
  }

  it('accumulates small wheel deltas: a hundred px is one step, however many events it takes', () => {
    const t = mountHarness(HTML);
    const readout = t.q('.sr-wpm')!;
    for (let i = 0; i < 24; i++) wheel(readout, { deltaY: -4 });
    expect(t.handle.player.settings.wpm).toBe(300);
    wheel(readout, { deltaY: -4 });
    expect(t.handle.player.settings.wpm).toBe(325);
    for (let i = 0; i < 50; i++) wheel(readout, { deltaY: -4 });
    expect(t.handle.player.settings.wpm).toBe(375);
  });

  it('leaves a mostly horizontal swipe to the browser (p1-r3)', () => {
    const t = mountHarness(HTML);
    const event = wheel(t.q('.sr-wpm')!, { deltaX: 120, deltaY: 30 });
    expect(event.defaultPrevented).toBe(false);
    expect(t.handle.player.settings.wpm).toBe(300);
  });

  it('forgets a partial turn after 300 ms without wheel events', () => {
    const t = mountHarness(HTML);
    const readout = t.q('.sr-wpm')!;
    wheel(readout, { deltaY: -60 });
    t.clock.advance(400);
    wheel(readout, { deltaY: -60 });
    expect(t.handle.player.settings.wpm).toBe(300);
    wheel(readout, { deltaY: -60 });
    expect(t.handle.player.settings.wpm).toBe(325);
  });

  it('converts line-mode wheel deltas', () => {
    const t = mountHarness(HTML);
    wheel(t.q('.sr-wpm')!, { deltaY: -7, deltaMode: 1 });
    expect(t.handle.player.settings.wpm).toBe(325);
  });

  it('ignores a wheel event with no vertical turn, and leaves ctrl and meta wheel (zoom) alone', () => {
    const t = mountHarness(HTML);
    const readout = t.q('.sr-wpm')!;
    expect(wheel(readout, { deltaX: 120, deltaY: 0 }).defaultPrevented).toBe(false);
    expect(wheel(readout, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(readout, { deltaY: -100, metaKey: true }).defaultPrevented).toBe(false);
    expect(t.handle.player.settings.wpm).toBe(300);
  });

  it('with trustedEventsOnly, a synthetic press or wheel does not change the speed', () => {
    const t = mountHarness(HTML, { trustedEventsOnly: true });
    press(t, 'Faster');
    const event = wheel(t.q('.sr-wpm')!, { deltaY: -100 });
    expect(event.defaultPrevented).toBe(false);
    expect(t.handle.player.settings.wpm).toBe(300);
  });

  it('keeps a focused button connected across a status rerender, and a pointer press returns focus to the reader', () => {
    const t = mountHarness(HTML);
    const faster = t.q<HTMLButtonElement>('.sr-wpm-step[aria-label="Faster"]')!;
    faster.focus();
    t.handle.player.toggle(); // the state changes: the status line renders again
    expect(text(t.q('.sr-status'))).toContain('Playing');
    expect(faster.isConnected).toBe(true);
    expect(t.q('.sr-wpm-step[aria-label="Faster"]')).toBe(faster);
    expect(document.activeElement).toBe(faster);
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    faster.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t.reader);
    t.key(' ');
    expect(t.handle.player.state).toBe('paused');
  });
});

describe('flowing motion', () => {
  const flowing = { readingMode: 'flow' as const, flowMotion: 'flowing' as const, chunkWords: 1 };
  type Harness = ReturnType<typeof mountHarness>;
  const xOf = (t: Harness) => Number(ribbonVar(t, '--sr-x'));
  /** Run `frames` frames of 16 ms, returning `--sr-x` and the player's index after each. */
  const sample = (t: Harness, frames: number) => {
    const out: { x: number; index: number; marked: string[] }[] = [];
    for (let i = 0; i < frames; i++) {
      t.runFrames(16);
      out.push({ x: xOf(t), index: t.handle.player.index, marked: t.qa('.sr-ribbon-row[data-position="middle"] .sr-w[data-in]').map((w) => text(w)) });
    }
    return out;
  };

  afterEach(() => {
    delete (Range.prototype as unknown as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it('moves --sr-x up on every frame, within a step and across steps, with no glide', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma delta epsilon zeta eta theta iota kappa.</p>', { settings: flowing });
    t.handle.player.toggle();
    const frames = sample(t, 60);
    expect(new Set(frames.map((f) => f.index)).size).toBeGreaterThan(3);
    frames.forEach((f, i) => {
      if (i > 0) expect(f.x).toBeGreaterThan(frames[i - 1].x);
    });
    expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
  });

  it('marks the words whose edge is inside the bracket on every frame', () => {
    stubRibbonLayout();
    const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa.'];
    const t = mountHarness(`<p>${words.join(' ')}</p>`, { settings: flowing });
    t.handle.player.toggle();
    // Words sit at start = sum of (length + 1) x 10; the bracket is [100, 300) on a 400px row.
    let start = 0;
    const boxes = words.map((w) => {
      const box = { w, start, width: w.length * 10 };
      start += (w.length + 1) * 10;
      return box;
    });
    const seen = new Set<string>();
    for (const f of sample(t, 90)) {
      const left = (b: { start: number }) => b.start - f.x + 200;
      const expected = boxes.filter((b) => left(b) < 300 && left(b) + b.width > 100).map((b) => b.w);
      expect(f.marked).toEqual(expected);
      seen.add(expected.join());
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('crosses an item gap in its own time, without holding', () => {
    stubRibbonLayout();
    const t = mountHarness('<ul><li>first list item that is rather long indeed</li><li>second list item that is also long</li></ul>', { settings: flowing });
    t.handle.player.toggle();
    const frames = sample(t, 160);
    // The first item's eight words are steps 0-7, the gap is step 8.
    const inGap = frames.filter((f) => f.index === 8);
    expect(inGap.length).toBeGreaterThan(1);
    frames.forEach((f, i) => {
      if (i > 0) expect(f.x).toBeGreaterThan(frames[i - 1].x);
    });
  });

  it('ends the word before an inline stop on its middle and holds there, with no back-glide', () => {
    stubRibbonLayout();
    const html = '<p>Call <code>x_long_identifier_name_ok</code> then go on.</p>';
    // The middle of the chip, from the same text in Word by word.
    const w = mountHarness(html, { settings: { ...flowing, flowMotion: 'word' } });
    w.handle.player.toggle();
    for (let i = 0; i < 10 && w.handle.player.state !== 'stopped'; i++) w.clock.advance(w.clock.nextIn()!);
    expect(w.handle.player.state).toBe('stopped');
    const chipMid = xOf(w);
    stubRibbonLayout();
    const t = mountHarness(html, { settings: flowing });
    t.handle.player.toggle();
    const frames: ReturnType<typeof sample> = [];
    for (let i = 0; i < 100 && t.handle.player.state !== 'stopped'; i++) frames.push(...sample(t, 1));
    expect(t.handle.player.state).toBe('stopped');
    frames.push(...sample(t, 10));
    for (const f of frames.slice(-10)) expect(f.x).toBeCloseTo(chipMid, 5);
    frames.forEach((f, i) => {
      if (i > 0) expect(f.x).toBeGreaterThanOrEqual(frames[i - 1].x - 1e-9);
    });
  });

  it('freezes on pause and resumes from the frozen point to the same end', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma delta epsilon.</p>', { settings: flowing });
    t.handle.player.toggle();
    sample(t, 4);
    const frozen = xOf(t);
    expect(t.handle.player.index).toBe(0);
    t.handle.player.toggle();
    expect(t.handle.player.state).toBe('paused');
    for (const f of sample(t, 10)) expect(f.x).toBe(frozen);
    t.handle.player.toggle();
    const after = sample(t, 40);
    expect(after[0].x).toBeGreaterThanOrEqual(frozen);
    expect(after[0].x - frozen).toBeLessThan(15);
    // alpha's middle is 25, beta's 75: the handover that ends alpha's step is 50, which the next step starts from.
    const firstOfNext = after.find((f) => f.index === 1)!;
    expect(firstOfNext.x).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(firstOfNext.x).toBeLessThan(50 + 15);
    for (const f of after.filter((f) => f.index === 0)) expect(f.x).toBeLessThanOrEqual(50 + 1e-6);
  });

  it('keeps pausing and resuming monotonic and never nests deeper', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowing });
    t.handle.player.toggle();
    let last = -Infinity;
    for (let n = 0; n < 4; n++) {
      for (const f of sample(t, 2)) {
        expect(f.x).toBeGreaterThanOrEqual(last);
        last = f.x;
      }
      t.handle.player.toggle();
      expect(xOf(t)).toBeCloseTo(last, 5);
      t.handle.player.toggle();
    }
  });

  it('glides a scrub word by word, as before', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma delta.</p>', { settings: flowing });
    t.handle.player.toggle();
    sample(t, 2);
    t.handle.player.scrub(2);
    expect(current(t)).toBe('gamma');
    expect(xOf(t)).toBe(110 + 20 + 5);
    expect(Number.parseFloat(ribbonVar(t, '--sr-glide'))).toBeGreaterThan(0);
    for (const f of sample(t, 3)) expect(f.x).toBe(135);
  });

  it('places the reached word at once on a jump while playing, then flows on from it', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta. Gamma delta epsilon.</p>', { settings: flowing });
    t.handle.player.toggle();
    sample(t, 2);
    t.handle.player.sentence(1);
    expect(current(t)).toBe('Gamma');
    // Gamma starts after "alpha beta. " (12 characters): its middle is 120 + 25.
    expect(xOf(t)).toBe(145);
    expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
    const frames = sample(t, 8);
    expect(frames[0].x).toBeGreaterThanOrEqual(145);
    expect(frames.at(-1)!.x).toBeGreaterThan(145);
  });

  it('crosses a window rebuild past RUN_EDGE without a backward step', () => {
    stubRibbonLayout();
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    const t = mountHarness(`<p>${words.join(' ')}.</p>`, { settings: { ...flowing, wpm: 1000 } });
    t.handle.player.toggle();
    // Start 5 words short of the window's edge (the ribbon is laid out again at word 300).
    t.handle.player.scrub(295);
    t.runFrames(700);
    const startOf = (i: number) => words.slice(0, i).reduce((n, w) => n + (w.length + 1) * 10, 0);
    const first = () => Number(t.q('.sr-ribbon-row[data-position="middle"] .sr-w')!.textContent!.slice(1));
    let last = -Infinity;
    let rebuilt = false;
    for (let i = 0; i < 200 && !rebuilt; i++) {
      t.runFrames(16);
      const absolute = xOf(t) + startOf(first());
      expect(absolute).toBeGreaterThanOrEqual(last - 1e-6);
      last = absolute;
      rebuilt = first() > 0;
    }
    expect(rebuilt).toBe(true);
    for (const f of sample(t, 20)) {
      const absolute = f.x + startOf(first());
      expect(absolute).toBeGreaterThanOrEqual(last - 1e-6);
      last = absolute;
    }
  });

  it('places without a slide under reduced motion', () => {
    stubRibbonLayout();
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: query.includes('reduce'), media: query });
    const t = mountHarness('<p>alpha beta gamma.</p>', { settings: flowing });
    t.handle.player.toggle();
    expect(xOf(t)).toBe(25);
    const frames = sample(t, 3);
    for (const f of frames) expect(f.x).toBe(25);
    expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
  });

  it('switches motion at once while playing, both ways', () => {
    stubRibbonLayout();
    const t = mountHarness('<p>alpha beta gamma delta epsilon zeta.</p>', { settings: flowing });
    t.handle.player.toggle();
    sample(t, 3);
    const before = xOf(t);
    t.handle.applySettings({ ...t.handle.player.settings, flowMotion: 'word' });
    // The current word is placed on the target: alpha's middle.
    expect(xOf(t)).toBe(25);
    expect(before).toBeGreaterThan(25);
    for (const f of sample(t, 2)) {
      expect(f.index).toBe(0);
      expect(f.x).toBe(25);
    }
    t.handle.applySettings({ ...t.handle.player.settings, flowMotion: 'flowing' });
    const frames = sample(t, 5);
    expect(frames[0].x).toBeGreaterThan(25);
    expect(frames.at(-1)!.x).toBeGreaterThan(frames[0].x);
  });

  describe('with speech', () => {
    const TEXT = '<p>The first sentence is here. A second one follows.</p>';
    const spoken = async (html = TEXT, estimate = false) => {
      stubRibbonLayout();
      const speech = fakeSpeech([voice('Alice', 'en-US', true)]);
      const t = mountHarness(html, {
        settings: { ...flowing, tts: { enabled: true, voiceURI: null } },
        speech: (clock) => createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock, lang: 'en', estimateBoundaries: estimate }),
      });
      await t.settle();
      t.handle.player.toggle();
      return { t, speech };
    };

    it("slides the sentence's first word over one spoken word's time, then holds at its end until a boundary", async () => {
      const { t } = await spoken();
      // 300 wpm: 200 ms per spoken word. 'The' has its middle at 15; 'first' (starts at 40) at 65; the handover is 40.
      expect(current(t)).toBe('The');
      expect(xOf(t)).toBe(15);
      t.runFrames(96);
      expect(xOf(t)).toBeCloseTo(15 + 25 * (96 / 200), 0);
      t.runFrames(112);
      expect(xOf(t)).toBeCloseTo(40, 5);
      const held = [xOf(t)];
      t.runFrames(160);
      held.push(xOf(t));
      expect(held[1]).toBe(held[0]);
    });

    it('starts a slide of one spoken word at each boundary, from where the ribbon is', async () => {
      const { t, speech } = await spoken();
      t.runFrames(320);
      const atFirst = xOf(t);
      speech.spoken[0].boundary(4); // 'first'
      expect(current(t)).toBe('first');
      expect(xOf(t)).toBeGreaterThanOrEqual(atFirst);
      t.runFrames(96);
      const mid = xOf(t);
      expect(mid).toBeGreaterThan(atFirst);
      t.runFrames(160);
      const end = xOf(t);
      expect(end).toBeGreaterThan(mid);
      t.runFrames(160);
      expect(xOf(t)).toBe(end);
    });

    it('retargets an early boundary from the current position, without a jump', async () => {
      const { t, speech } = await spoken();
      t.runFrames(320);
      speech.spoken[0].boundary(4);
      t.runFrames(48);
      const before = xOf(t);
      speech.spoken[0].boundary(10); // 'sentence' arrives early
      expect(current(t)).toBe('sentence');
      expect(xOf(t)).toBeCloseTo(before, 5);
      t.runFrames(48);
      expect(xOf(t)).toBeGreaterThan(before);
    });

    it('treats a jump while speaking as a jump: the reached word is placed at once', async () => {
      const { t } = await spoken();
      t.runFrames(100);
      t.handle.player.sentence(1);
      expect(current(t)).toBe('A');
      // 'A' starts after "The first sentence is here. " (28 characters), 10px wide.
      expect(xOf(t)).toBe(285);
      expect(ribbonVar(t, '--sr-glide')).toBe('0ms');
      t.runFrames(100);
      expect(xOf(t)).toBeGreaterThan(285);
    });

    it('holds the ribbon with the braces hidden and nothing marked when the voice gives no boundaries', async () => {
      const { t, speech } = await spoken();
      speech.spoken[0].end();
      t.clock.advance(1000);
      expect(t.q('.sr-flow-target')!.hidden).toBe(true);
      expect(t.qa('.sr-w[data-in]')).toHaveLength(0);
      const x = xOf(t);
      t.runFrames(160);
      expect(xOf(t)).toBe(x);
    });
  });
});
