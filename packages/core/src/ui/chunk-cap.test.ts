// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountHarness } from '../testing/reader';
import { chunkFit } from './chunk-fit';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Fake layout: widths by class name (the stage and the 10-character probe). */
function stubWidths(widths: Record<string, number>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const cls = Object.keys(widths).find((c) => this.classList.contains(c));
    const width = cls ? widths[cls] : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
}

function stubObservers() {
  const callbacks: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  return () => callbacks.forEach((cb) => cb());
}

const TEXT = '<p>aa bb cc dd ee ff gg hh ii jj kk ll mm nn.</p>';
const WIDE = { chunkWords: 8, chunkChars: 80 };
const chars = (t: ReturnType<typeof mountHarness>) => t.handle.player.settings.chunkChars;
const words = (t: ReturnType<typeof mountHarness>) => t.handle.player.settings.chunkWords;

describe('chunkFit', () => {
  it('is floor(stage width / char width) in [5, 80], none without a measure', () => {
    expect(chunkFit(600, 100)).toBe(60);
    expect(chunkFit(605, 100)).toBe(60);
    expect(chunkFit(30, 100)).toBe(5);
    expect(chunkFit(5000, 100)).toBe(80);
    expect(chunkFit(0, 100)).toBeNull();
    expect(chunkFit(600, 0)).toBeNull();
  });
});

describe('the bottom-stage chunk cap (R11)', () => {
  it('no longer caps the stored limits at 3 words and 20 characters', async () => {
    const t = mountHarness(TEXT, { bottomStage: true, saved: WIDE });
    await t.settle();
    expect(words(t)).toBe(8);
    expect(chars(t)).toBe(80);
    t.handle.player.toggle();
    expect(t.q('.sr-chunk')!.textContent!.trim().split(/\s+/)).toHaveLength(8);
  });

  it('clamps the effective characters to what fits the stage, keeping the stored value', async () => {
    stubWidths({ 'sr-display': 400, 'sr-fit-probe': 100 });
    const t = mountHarness(TEXT, { bottomStage: true, saved: WIDE });
    await t.settle();
    expect(chars(t)).toBe(40);
    expect(words(t)).toBe(8);
    // A saved change keeps the user's value, not the clamp.
    t.handle.player.setSpeed(400);
    const saved = t.store.save.mock.calls.at(-1)![0];
    expect(saved.chunkChars).toBe(80);
    expect(saved.wpm).toBe(400);
  });

  it('measures again on resize and rebuilds the timeline keeping the position', async () => {
    const resize = stubObservers();
    stubWidths({ 'sr-display': 400, 'sr-fit-probe': 100 });
    const t = mountHarness(TEXT, { bottomStage: true, saved: WIDE });
    await t.settle();
    t.handle.player.toggle();
    t.handle.player.toggle();
    t.handle.player.sentence(1);
    const before = t.handle.player.index;
    const source = t.doc.sections[0].blocks[0].source;
    expect(chars(t)).toBe(40);
    stubWidths({ 'sr-display': 700, 'sr-fit-probe': 100 });
    resize();
    expect(chars(t)).toBe(70);
    stubWidths({ 'sr-display': 100, 'sr-fit-probe': 100 });
    resize();
    expect(chars(t)).toBe(10);
    expect(t.handle.player.index).toBeGreaterThanOrEqual(0);
    expect(t.handle.player.index).toBeLessThanOrEqual(before + 20);
    expect(t.q('.sr-chunk')).not.toBeNull();
    expect(source).toBeDefined();
    // Back to no layout: no cap applies and the stored value is in force again.
    stubWidths({});
    resize();
    expect(chars(t)).toBe(80);
  });

  it('leaves a reader without a bottom stage alone', async () => {
    stubWidths({ 'sr-display': 100, 'sr-fit-probe': 100 });
    const t = mountHarness(TEXT, { saved: WIDE });
    await t.settle();
    expect(chars(t)).toBe(80);
  });

  it('shows fit as the characters maximum, refreshed when the panel opens, and 10 as the words maximum', async () => {
    const resize = stubObservers();
    stubWidths({ 'sr-display': 400, 'sr-fit-probe': 100 });
    const t = mountHarness(TEXT, { bottomStage: true, saved: WIDE });
    await t.settle();
    const open = () => {
      t.q<HTMLButtonElement>('.sr-settings-button')!.click();
      return t.q('.sr-settings')!;
    };
    const panel = open();
    expect(panel.querySelector<HTMLInputElement>('[name="chunkChars"]')!.max).toBe('40');
    expect(panel.querySelector<HTMLInputElement>('[name="chunkWords"]')!.max).toBe('10');
    expect(panel.querySelector<HTMLInputElement>('[name="chunkChars"]')!.value).toBe('80');
    t.q<HTMLButtonElement>('.sr-settings-done')!.click();
    stubWidths({ 'sr-display': 600, 'sr-fit-probe': 100 });
    resize();
    open();
    expect(panel.querySelector<HTMLInputElement>('[name="chunkChars"]')!.max).toBe('60');
  });
});

describe('a chunk wider than the stage (R11)', () => {
  const MIXED = '<p>Supercalifragilistic_identifier_here and more.</p>';

  it('aligns bottom-stage chunks with the axis at 50%, shrinking to 0.5 and then wrapping', async () => {
    stubWidths({ 'sr-display': 400, 'sr-before': 700, 'sr-pivot': 20, 'sr-after': 700 });
    const t = mountHarness(MIXED, { bottomStage: true, saved: WIDE });
    await t.settle();
    t.handle.player.toggle();
    expect(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale')).toBe('0.500');
    expect(t.q('.sr-display')!.dataset.wrap).toBe('true');
  });

  it('only shrinks a chunk that fits once scaled, with no wrap', async () => {
    // axis 200, room per side 188: left 270 -> 0.696
    stubWidths({ 'sr-display': 400, 'sr-before': 260, 'sr-pivot': 20, 'sr-after': 260 });
    const t = mountHarness(MIXED, { bottomStage: true, saved: WIDE });
    await t.settle();
    t.handle.player.toggle();
    const scale = Number(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale'));
    expect(scale).toBeGreaterThan(0.5);
    expect(scale).toBeLessThan(1);
    expect(t.q('.sr-display')!.dataset.wrap).toBeUndefined();
  });

  it('leaves a chunk that fits unscaled', async () => {
    stubWidths({ 'sr-display': 400, 'sr-before': 60, 'sr-pivot': 20, 'sr-after': 60 });
    const t = mountHarness(MIXED, { bottomStage: true, saved: WIDE });
    await t.settle();
    t.handle.player.toggle();
    expect(t.q('.sr-chunk')!.style.getPropertyValue('--sr-scale')).toBe('');
    expect(t.q('.sr-display')!.dataset.wrap).toBeUndefined();
  });
});
