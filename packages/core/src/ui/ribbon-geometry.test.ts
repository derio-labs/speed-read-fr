import { describe, expect, it } from 'vitest';
import {
  GLIDE_MAX_MS,
  anchorX,
  overlapping,
  pointAnchor,
  slideX,
  type Anchor,
  RUN_EDGE,
  RUN_WINDOW,
  firstLetter,
  focusWidth,
  glideMs,
  inBracket,
  runBounds,
  runWindow,
  type WordSpan,
} from './ribbon-geometry';

/** Ten-px letters: word i is `width` wide, one 10px gap after it, middle letter centred. */
function spans(widths: number[]): WordSpan[] {
  let start = 0;
  return widths.map((width) => {
    const span = { start, width, mid: start + width / 2 };
    start += width + 10;
    return span;
  });
}

describe('runBounds', () => {
  const words = (n: number) => Array.from({ length: n }, () => ({ kind: 'chunk' }));
  it('stops at card steps', () => {
    const steps = [...words(3), { kind: 'stop' }, ...words(2), { kind: 'chapter' }, ...words(2)];
    expect(runBounds(steps, 1)).toEqual({ first: 0, last: 2 });
    expect(runBounds(steps, 4)).toEqual({ first: 4, last: 5 });
    expect(runBounds(steps, 7)).toEqual({ first: 7, last: 8 });
  });

  it('runs through item gaps and item chunks but not through whole-list or end cards', () => {
    const steps = [{ kind: 'item-chunk' }, { kind: 'item-gap' }, { kind: 'item-chunk' }, { kind: 'list-whole' }, { kind: 'item-chunk' }];
    expect(runBounds(steps, 0)).toEqual({ first: 0, last: 2 });
    expect(runBounds(steps, 4)).toEqual({ first: 4, last: 4 });
  });

  it('runs through an inline stop or dwell', () => {
    const steps = [...words(2), { kind: 'stop', inlineIndex: 1 }, ...words(2), { kind: 'dwell', inlineIndex: 2 }, ...words(1), { kind: 'dwell' }];
    expect(runBounds(steps, 0)).toEqual({ first: 0, last: 6 });
  });

  it('is null on a card step', () => {
    expect(runBounds([{ kind: 'chapter' }], 0)).toBeNull();
  });
});

describe('runWindow', () => {
  it('covers a short run whole', () => {
    expect(runWindow({ first: 0, last: 99 }, 10, null)).toEqual({ from: 0, to: 99 });
  });

  it('is RUN_WINDOW words centred on the position in a long run', () => {
    const w = runWindow({ first: 0, last: 5000 }, 1000, null);
    expect(w.to - w.from + 1).toBe(RUN_WINDOW);
    expect(w.from).toBe(800);
    expect(w.to).toBe(1199);
  });

  it('keeps the window while the position is more than RUN_EDGE words from its edges', () => {
    const run = { first: 0, last: 5000 };
    const w = runWindow(run, 1000, null);
    expect(runWindow(run, 1000 + 99, w)).toBe(w);
    expect(runWindow(run, 800 + RUN_EDGE + 1, w)).toBe(w);
  });

  it('re-centres within RUN_EDGE words of an edge that is not the run edge', () => {
    const run = { first: 0, last: 5000 };
    const w = runWindow(run, 1000, null);
    const moved = runWindow(run, w.to - RUN_EDGE + 1, w);
    expect(moved).not.toBe(w);
    expect(moved.from).toBe(w.to - RUN_EDGE + 1 - RUN_WINDOW / 2);
  });

  it('does not re-centre at the run edge itself and clamps to the run', () => {
    const run = { first: 0, last: 5000 };
    const first = runWindow(run, 3, null);
    expect(first).toEqual({ from: 0, to: RUN_WINDOW - 1 });
    expect(runWindow(run, 5, first)).toBe(first);
    const last = runWindow(run, 4998, null);
    expect(last).toEqual({ from: 5000 - RUN_WINDOW + 1, to: 5000 });
    expect(runWindow(run, 4999, last)).toBe(last);
  });

  it('rebuilds a window that no longer holds the position', () => {
    const run = { first: 0, last: 5000 };
    const w = runWindow(run, 1000, null);
    const far = runWindow(run, 4000, w);
    expect(far.from).toBeLessThanOrEqual(4000);
    expect(far.to).toBeGreaterThanOrEqual(4000);
  });
});

describe('glideMs', () => {
  it('is a third of a word time, never above 100 ms', () => {
    expect(glideMs({ wpm: 150, distance: 50, rowWidth: 400, reducedMotion: false })).toBe(GLIDE_MAX_MS);
    expect(glideMs({ wpm: 300, distance: 50, rowWidth: 400, reducedMotion: false })).toBeCloseTo(200 / 3);
    expect(glideMs({ wpm: 600, distance: 50, rowWidth: 400, reducedMotion: false })).toBeCloseTo(100 / 3);
  });

  it('is 0 for a move over one row width and under reduced motion', () => {
    expect(glideMs({ wpm: 300, distance: 401, rowWidth: 400, reducedMotion: false })).toBe(0);
    expect(glideMs({ wpm: 150, distance: 400, rowWidth: 400, reducedMotion: false })).toBe(GLIDE_MAX_MS);
    expect(glideMs({ wpm: 300, distance: 10, rowWidth: 400, reducedMotion: true })).toBe(0);
  });
});

describe('focusWidth', () => {
  it('is the focus span in measured characters', () => {
    expect(focusWidth({ focusChars: 20, charWidth: 10, row: 1000 })).toBe(200);
    expect(focusWidth({ focusChars: 6, charWidth: 8.5, row: 1000 })).toBeCloseTo(51);
  });

  it('is never wider than the row', () => {
    expect(focusWidth({ focusChars: 40, charWidth: 10, row: 300 })).toBe(300);
  });

  it('is zero without a measure', () => {
    expect(focusWidth({ focusChars: 20, charWidth: 0, row: 1000 })).toBe(0);
  });
});

describe('firstLetter', () => {
  it('finds the first letter or digit as offsets', () => {
    expect(firstLetter('hello')).toEqual([0, 1]);
    expect(firstLetter('(Über')).toEqual([1, 2]);
    expect(firstLetter('42nd')).toEqual([0, 1]);
    expect(firstLetter('\u27e8code 1\u27e9')).toEqual([1, 2]);
  });
  it('is null for a word without a letter or digit', () => {
    expect(firstLetter('\u2014')).toBeNull();
    expect(firstLetter('')).toBeNull();
  });
  it('returns a whole code point for a surrogate pair', () => {
    expect(firstLetter('\u{1d4d0}b')).toEqual([0, 2]);
    expect(firstLetter('"\u{1d4d0}b')).toEqual([1, 3]);
  });
});

describe('inBracket', () => {
  // Row 400, bracket 100 wide at x 150: [150, 250). A word at line start s with the line at x sits at s - x + 200.
  const target = { x: 150, w: 100 };
  const row = 400;
  it('is true when the word overlaps the bracket by a sliver', () => {
    // right edge = 150.1: start 100.1 - x 0 + 200 - ... use x so left = 100.1, width 50
    expect(inBracket({ span: { start: 100.1 - 200, width: 50 }, x: 0, row, target })).toBe(true);
  });
  it('is false when the word only touches the bracket, on either side', () => {
    expect(inBracket({ span: { start: 100 - 200, width: 50 }, x: 0, row, target })).toBe(false);
    expect(inBracket({ span: { start: 250 - 200, width: 50 }, x: 0, row, target })).toBe(false);
  });
  it('is true when the word spans the whole bracket', () => {
    expect(inBracket({ span: { start: 100 - 200, width: 200 }, x: 0, row, target })).toBe(true);
  });
  it('follows the line offset', () => {
    expect(inBracket({ span: { start: 0, width: 50 }, x: 0, row, target })).toBe(true);
    expect(inBracket({ span: { start: 0, width: 50 }, x: 100, row, target })).toBe(false);
  });
});

describe('anchorX', () => {
  // widths 40, 60, 20, 30 with a 10px gap: starts 0, 50, 120, 150; mids 20, 80, 130, 165.
  const sp = spans([40, 60, 20, 30]);
  const order = [10, 11, 12, 13];
  const x = (anchor: Anchor) => anchorX(sp, order, anchor);

  it("'mid' is the word's middle", () => {
    expect(x({ word: 11, at: 'mid' })).toBe(80);
  });
  it("'before' is the handover from the previous word, and the middle for the window's first word", () => {
    expect(x({ word: 11, at: 'before' })).toBe((20 + 80) / 2);
    expect(x({ word: 10, at: 'before' })).toBe(20);
  });
  it("'after' is the handover to the next word, and the middle for the run's last word", () => {
    expect(x({ word: 11, at: 'after' })).toBe((80 + 130) / 2);
    expect(x({ word: 13, at: 'after' })).toBe(165);
  });
  it("'end' and 'begin' are the word's right and left edge, for crossing a gap", () => {
    expect(x({ word: 11, at: 'end' })).toBe(110);
    expect(x({ word: 12, at: 'begin' })).toBe(120);
  });
  it('interpolates a frozen point between two anchors', () => {
    const frozen: Anchor = { between: [{ word: 10, at: 'mid' }, { word: 11, at: 'mid' }], t: 0.25 };
    expect(x(frozen)).toBe(20 + 0.25 * 60);
  });
  it('re-derives from the spans it is given (a re-layout moves the anchors, not the slide)', () => {
    expect(anchorX(sp.map((s) => ({ ...s, mid: s.mid + 100 })), order, { word: 11, at: 'mid' })).toBe(180);
  });
});

describe('pointAnchor', () => {
  // mids 20, 80, 130, 165; first word starts at 0, last ends at 180.
  const sp = spans([40, 60, 20, 30]);
  const order = [10, 11, 12, 13];
  const flat = (a: Anchor | null) => !!a && 'between' in a && a.between.every((b) => !('between' in b));

  it('re-expresses a pixel between the two adjacent word middles, one level deep', () => {
    const a = pointAnchor(sp, order, 105)!;
    expect(a).toEqual({ between: [{ word: 11, at: 'mid' }, { word: 12, at: 'mid' }], t: 0.5 });
    expect(anchorX(sp, order, a)).toBe(105);
  });
  it("uses the first word's left edge and the last word's right edge outside the middles", () => {
    expect(anchorX(sp, order, pointAnchor(sp, order, 10)!)).toBe(10);
    expect(anchorX(sp, order, pointAnchor(sp, order, 172)!)).toBe(172);
    expect(anchorX(sp, order, pointAnchor(sp, order, 80)!)).toBe(80);
  });
  it('stays flat however often a cut-short slide is frozen again', () => {
    let here: Anchor = { word: 10, at: 'mid' };
    for (let i = 0; i < 50; i++) {
      const to: Anchor = { word: order[(i % 3) + 1], at: 'after' };
      const x = anchorX(sp, order, here) + (anchorX(sp, order, to) - anchorX(sp, order, here)) * 0.3;
      here = pointAnchor(sp, order, x)!;
      expect(flat(here)).toBe(true);
    }
  });
  it('is null with no spans', () => {
    expect(pointAnchor([], [], 5)).toBeNull();
  });
});

describe('overlapping', () => {
  // spans [0,40) [50,110) [120,140) [150,180)
  const sp = spans([40, 60, 20, 30]);
  it('finds exactly the spans that overlap an open interval', () => {
    expect(overlapping(sp, 45, 125)).toEqual([1, 3]);
    expect(overlapping(sp, 40, 50)).toEqual([1, 1]);
    expect(overlapping(sp, -10, 500)).toEqual([0, 4]);
    expect(overlapping(sp, 180, 300)).toEqual([4, 4]);
  });
  it('agrees with a full scan', () => {
    for (let lo = -20; lo < 200; lo += 7) {
      const hi = lo + 33;
      const [a, b] = overlapping(sp, lo, hi);
      const scan = sp.map((s, i) => (s.start < hi && s.start + s.width > lo ? i : -1)).filter((i) => i >= 0);
      expect(Array.from({ length: b - a }, (_, k) => a + k)).toEqual(scan);
    }
  });
});

describe('slideX', () => {
  const base = { fromX: 100, toX: 200, startedAt: 1000, durationMs: 500 };
  it('moves linearly, clamped to [fromX, toX]', () => {
    expect(slideX({ ...base, now: 1000 })).toBe(100);
    expect(slideX({ ...base, now: 1250 })).toBe(150);
    expect(slideX({ ...base, now: 1500 })).toBe(200);
    expect(slideX({ ...base, now: 900 })).toBe(100);
    expect(slideX({ ...base, now: 9000 })).toBe(200);
  });
  it('lands on toX at once for a duration of 0', () => {
    expect(slideX({ ...base, durationMs: 0, now: 1000 })).toBe(200);
  });
});
