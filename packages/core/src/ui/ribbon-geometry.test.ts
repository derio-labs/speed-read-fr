import { describe, expect, it } from 'vitest';
import {
  GLIDE_MAX_MS,
  RUN_EDGE,
  RUN_WINDOW,
  focusWidth,
  glideMs,
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
