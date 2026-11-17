// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTICLE, mountHarness } from '../testing/reader';
import { PUSH_GAP_PX, stagePush } from './layout';
import { READER_CSS } from './styles';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('stagePush: the narrow exhibit push (spec section 13, R28)', () => {
  const base = { cardTop: 8, resting: 300, stageHeight: 320, floor: 788 };

  it('with no exhibit the stage rests', () => {
    expect(stagePush({ ...base, shown: false, cardHeight: 500 }).top).toBe(300);
  });

  it('a short card that ends above the resting stage does not move it', () => {
    expect(stagePush({ ...base, shown: true, cardHeight: 200 }).top).toBe(300);
  });

  it('a taller card pushes the stage to 12 px below its bottom', () => {
    expect(PUSH_GAP_PX).toBe(12);
    expect(stagePush({ ...base, shown: true, cardHeight: 380 }).top).toBe(8 + 380 + 12);
  });

  it('the card may grow to the room above the stage at its lowest position, and the stage stays inside', () => {
    const lowest = base.floor - base.stageHeight; // 468
    const r = stagePush({ ...base, shown: true, cardHeight: 2000 });
    expect(r.cardMax).toBe(lowest - PUSH_GAP_PX - base.cardTop);
    expect(r.top).toBe(lowest);
    expect(r.top + base.stageHeight).toBeLessThanOrEqual(base.floor);
  });

  it('never returns a negative card height or a stage above the reader', () => {
    const r = stagePush({ cardTop: 8, resting: 0, stageHeight: 900, floor: 400, shown: true, cardHeight: 100 });
    expect(r.cardMax).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
  });
});

describe('layout option', () => {
  it('defaults to panel', () => {
    const t = mountHarness(ARTICLE);
    expect(t.reader.dataset.layout).toBe('panel');
    expect(t.q('.sr-layout > .sr-outline-bar')).not.toBeNull();
  });

  it('floating: three separate cards, the outline bar inside the stage card header', () => {
    const t = mountHarness(ARTICLE, { layout: 'floating' });
    expect(t.reader.dataset.layout).toBe('floating');
    expect(t.q('.sr-layout > .sr-outline')).not.toBeNull();
    expect(t.q('.sr-layout > .sr-main')).not.toBeNull();
    expect(t.q('.sr-layout > .sr-exhibits')).not.toBeNull();
    expect(t.q('.sr-main > .sr-outline-bar')).not.toBeNull();
    expect(t.q('.sr-main')!.firstElementChild!.classList.contains('sr-outline-bar')).toBe(true);
  });

  it('the stylesheet makes the floating root transparent and gives each zone its own card', () => {
    const floating = READER_CSS.slice(READER_CSS.indexOf('/* Floating layout'));
    expect(floating).toMatch(/\.sr-reader\[data-layout="floating"\]\s*\{[^}]*background:\s*transparent/);
    for (const zone of ['sr-outline', 'sr-main', 'sr-exhibits']) {
      expect(floating).toContain(`[data-layout="floating"] .${zone}`);
    }
    expect(floating).toMatch(/max-width:\s*1179px/);
    expect(READER_CSS).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('marks the exhibit pane empty until an exhibit is revealed', () => {
    const t = mountHarness(ARTICLE);
    const pane = t.q('.sr-exhibits')!;
    expect(pane.hasAttribute('data-empty')).toBe(true);
    // Into the Setup section, past the code stop.
    t.handle.player.jumpToSection(t.doc.sections[1].id);
    for (let i = 0; i < 12 && !t.q('.sr-exhibit'); i++) t.handle.player.sentence(1);
    expect(t.q('.sr-exhibit')).not.toBeNull();
    expect(pane.hasAttribute('data-empty')).toBe(false);
  });

  it('an expanded exhibit covers the reader root, not only the stage column', () => {
    const t = mountHarness(ARTICLE);
    t.handle.player.toggle();
    for (let i = 0; i < 40 && t.q('.sr-display')!.dataset.kind !== 'stop'; i++) {
      if (t.handle.player.state === 'stopped') t.handle.player.continue();
      else t.clock.advance(t.clock.nextIn() ?? 0);
    }
    t.handle.player.expand();
    const expanded = t.q('.sr-expanded')!;
    expect(expanded).not.toBeNull();
    expect(expanded.parentElement!.classList.contains('sr-layout')).toBe(true);
    expect(READER_CSS).toMatch(/\.sr-expanded\s*\{[^}]*inset:\s*6% 4%/);
  });
});

describe('push controller', () => {
  /** Fake layout: rects, heights by class; the reader is `width` wide and 800 high. */
  function stub(width: number, heights: Record<string, number>) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const cls = Object.keys(heights).find((c) => this.classList.contains(c));
      const isReader = this.classList.contains('sr-reader');
      const h = isReader ? 800 : cls ? heights[cls] : 0;
      const top = this.classList.contains('sr-overall') ? 97 : 0;
      return { width: isReader ? width : 0, height: h, top, left: 0, right: width, bottom: top + h, x: 0, y: top, toJSON() {} } as DOMRect;
    });
    const height = (el: Element) => {
      const cls = Object.keys(heights).find((c) => el.classList.contains(c));
      return cls ? heights[cls] : 0;
    };
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return height(this);
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('sr-exhibit-list') ? heights.content ?? 0 : height(this);
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('sr-exhibit-list') ? 100 : height(this);
    });
  }

  it('floating and narrow: sets the stage top and the card maximum; wide: clears them', () => {
    stub(700, { 'sr-main': 300, 'sr-exhibits': 140, 'sr-exhibits-head': 30, content: 400 });
    const t = mountHarness(ARTICLE, { layout: 'floating' });
    t.q('.sr-exhibits')!.removeAttribute('data-empty');
    t.handle.relayout();
    const style = t.reader.style;
    // Card content = head 30 + list 400 + borders 2 = 432; resting = 800 * 0.56 - 150 = 298.
    expect(style.getPropertyValue('--sr-stage-top')).toBe(`${8 + 432 + 12}px`);
    expect(style.getPropertyValue('--sr-exhibit-top')).toBe('8px');
    expect(style.getPropertyValue('--sr-exhibit-max')).toBe(`${800 - 12 - 300 - 12 - 8}px`);
    // The card's height is set (and animated by the stylesheet) with the stage's top (p5a-r7).
    expect(style.getPropertyValue('--sr-exhibit-height')).toBe('432px');
    t.q('.sr-exhibits')!.setAttribute('data-empty', '');
    t.handle.relayout();
    expect(style.getPropertyValue('--sr-exhibit-height')).toBe('0px');
    vi.restoreAllMocks();
    stub(1300, { 'sr-main': 300 });
    t.handle.relayout();
    expect(style.getPropertyValue('--sr-stage-top')).toBe('');
  });
});

describe('free band (p5a-r8)', () => {
  it('is the room between the exhibit card (or the reader top) and the stage, in viewport px', () => {
    const t = mountHarness(ARTICLE, { layout: 'floating' });
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('sr-reader')) return rect(0, 800);
      if (this.classList.contains('sr-main')) return rect(460, 300);
      if (this.classList.contains('sr-exhibits')) return rect(8, 432);
      return rect(0, 0);
    });
    // Wide (jsdom has no container queries: the reader is 100 px wide here, so narrow).
    const pane = t.q('.sr-exhibits')!;
    expect(t.handle.freeBand()).toEqual({ top: 0, bottom: 460, below: 760 });
    pane.removeAttribute('data-empty');
    expect(t.handle.freeBand()).toEqual({ top: 440, bottom: 460, below: 760 });
  });
});
