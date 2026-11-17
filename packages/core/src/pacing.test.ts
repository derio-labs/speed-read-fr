import { describe, expect, it } from 'vitest';
import { rampFactor, sectionEstimate, stepDuration, STOP_ESTIMATE_MS } from './pacing';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { doc, exhibit, flatList, prose, section } from './testing/doc';
import { buildTimeline, type Step } from './timeline';

const s300: Settings = { ...DEFAULT_SETTINGS, wpm: 300 }; // base = 200 ms
const base = 200;
const stepsOf = (d: ReturnType<typeof doc>, s: Settings = s300) => buildTimeline(d, s).steps;
const firstChunk = (text: string, s: Settings = s300): Step => stepsOf(doc(section('s', undefined, prose(text))), s)[0];

describe('stepDuration', () => {
  it('is base x tokens for a plain chunk, base = 60000 / wpm', () => {
    expect(stepDuration(firstChunk('one two three four'), s300)).toBeCloseTo(3 * base);
    const s600 = { ...s300, wpm: 600 };
    expect(stepDuration(firstChunk('one two three four', s600), s600)).toBeCloseTo(3 * 100);
  });

  it('adds 0.5 base for a clause end', () => {
    expect(stepDuration(firstChunk('one two, three'), s300)).toBeCloseTo(2 * base + 0.5 * base);
  });

  it('adds 1.2 base for a sentence end', () => {
    expect(stepDuration(firstChunk('one two.'), s300)).toBeCloseTo(2 * base + 1.2 * base);
  });

  it('adds 0.3 base per token longer than 8 characters', () => {
    // "extraordinary" (13) and "remarkable" (10) are long, "eightchr" (8) is not
    const wide = { ...s300, chunkChars: 80 };
    expect(stepDuration(firstChunk('extraordinary remarkable eightchr more', wide), wide)).toBeCloseTo(
      3 * base + 2 * 0.3 * base,
    );
  });

  it('times item-chunk steps like chunks', () => {
    const steps = stepsOf(doc(section('s', undefined, flatList('one two three four five six seven.'))));
    expect(steps[0].kind).toBe('item-chunk');
    expect(stepDuration(steps[0], s300)).toBeCloseTo(3 * base);
    expect(stepDuration(steps[2], s300)).toBeCloseTo(1 * base + 1.2 * base);
  });

  it('gives title 1200 ms and item-gap 400 ms', () => {
    const steps = stepsOf(doc(section('s', { level: 4, text: 'T' }, flatList('one two three four five six seven'))));
    expect(steps[0].kind).toBe('title');
    expect(stepDuration(steps[0], s300)).toBe(1200);
    const gap = steps.find((s) => s.kind === 'item-gap')!;
    expect(stepDuration(gap, s300)).toBe(400);
  });

  it('gives list-whole max(1500, words x base x 1.5)', () => {
    const small = stepsOf(doc(section('s', undefined, flatList('a', 'b'))))[0];
    expect(small.kind).toBe('list-whole');
    expect(stepDuration(small, s300)).toBe(1500);
    const big = stepsOf(doc(section('s', undefined, flatList('a b c d e f', 'a b c d e f'))))[0];
    expect(stepDuration(big, s300)).toBeCloseTo(12 * base * 1.5);
  });

  it('gives dwell steps their seconds x 1000', () => {
    const s = { ...s300, imageDwellSeconds: 4, code: { mode: 'dwell' as const, dwellSeconds: 9 } };
    const steps = stepsOf(doc(section('s', undefined, exhibit('image'), exhibit('code'))), s);
    expect(steps.map((st) => stepDuration(st, s))).toEqual([4000, 9000]);
  });

  it('has no duration for stop and chapter steps', () => {
    const steps = stepsOf(doc(section('s', { level: 1, text: 'C' }, exhibit('table'))));
    expect(steps.map((st) => stepDuration(st, s300))).toEqual([null, null]);
  });
});

describe('rampFactor', () => {
  it('ramps 0.60 to 1 over six steps, then stays at 1', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 50].map(rampFactor)).toEqual([0.6, 0.68, 0.76, 0.84, 0.92, 1, 1, 1, 1]);
  });
});

describe('sectionEstimate', () => {
  it('sums timed durations without ramp and counts each stop and chapter as 3000 ms', () => {
    expect(STOP_ESTIMATE_MS).toBe(3000);
    const steps = stepsOf(
      doc(section('s', { level: 1, text: 'C' }, prose('one two.'), exhibit('code'), exhibit('image'))),
    );
    expect(steps.map((s) => s.kind)).toEqual(['chapter', 'chunk', 'stop', 'dwell']);
    expect(sectionEstimate(steps, s300)).toBeCloseTo(3000 + (2 * base + 1.2 * base) + 3000 + 3000);
    expect(sectionEstimate([], s300)).toBe(0);
  });
});
