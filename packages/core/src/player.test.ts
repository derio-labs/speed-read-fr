import { describe, expect, it } from 'vitest';
import type { Doc } from './model';
import { rampFactor } from './pacing';
import { createPlayer, type PlayerEvents, type StepEvent } from './player';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { fakeClock } from './testing/clock';
import { doc, exhibit, flatList, prose, section } from './testing/doc';
import { buildTimeline } from './timeline';

const base = 200; // 300 wpm
const one: Settings = { ...DEFAULT_SETTINGS, chunkWords: 1 };

function setup(d: Doc, settings: Settings = one) {
  const clock = fakeClock();
  const timeline = buildTimeline(d, settings);
  const player = createPlayer(timeline, settings, clock);
  const steps: StepEvent[] = [];
  const states: string[] = [];
  const positions: PlayerEvents['position'][] = [];
  const saved: Settings[] = [];
  player.on('step', (e) => steps.push(e));
  player.on('state', (s) => states.push(s));
  player.on('position', (p) => positions.push(p));
  player.on('settings', (s) => saved.push(s));
  const texts = () => steps.map((e) => (e.step.kind === 'chunk' || e.step.kind === 'item-chunk' ? e.step.chunk.text : e.step.kind));
  return { clock, timeline, player, steps, states, positions, saved, texts };
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('player: playing', () => {
  it('starts idle and plays from the first step, emitting steps at the computed times', () => {
    const { clock, player, steps, texts, states } = setup(doc(section('s', undefined, prose('aa bb cc'))));
    expect(player.state).toBe('idle');
    player.toggle();
    expect(states).toEqual(['playing']);
    expect(texts()).toEqual(['aa']);
    const first = base / rampFactor(0);
    expect(steps[0].durationMs).toBeCloseTo(first);
    clock.advance(first - 1);
    expect(texts()).toEqual(['aa']);
    clock.advance(1);
    expect(texts()).toEqual(['aa', 'bb']);
    expect(steps[1].durationMs).toBeCloseTo(base / rampFactor(1));
  });

  it('ramps the first six chunk steps after start, not the seventh', () => {
    const { clock, player, steps } = setup(doc(section('s', undefined, prose(words(8)))));
    player.toggle();
    for (let i = 0; i < 7; i++) clock.advance(steps[steps.length - 1].durationMs!);
    expect(steps.slice(0, 7).map((e) => e.durationMs)).toEqual(
      [0.6, 0.68, 0.76, 0.84, 0.92, 1, 1].map((f) => base / f),
    );
  });

  it('neither restarts nor consumes the ramp on item-gap, title, dwell and list-whole steps', () => {
    const d = doc(
      section('a', undefined, prose('aa bb cc'), exhibit('image'), flatList('x', 'y')),
      section('b', { level: 4, text: 'T' }, flatList('one two three four five six seven')),
    );
    const { clock, player, steps, texts } = setup(d);
    player.toggle();
    while (steps.length < 12) clock.advance(steps[steps.length - 1].durationMs!);
    expect(texts().slice(0, 12)).toEqual([
      'aa', 'bb', 'cc', 'dwell', 'list-whole', 'title', 'one', 'two', 'three', 'four', 'five', 'six',
    ]);
    const ms = steps.map((e) => e.durationMs);
    expect(ms[3]).toBe(3000);
    expect(ms[4]).toBe(1500);
    expect(ms[5]).toBe(1200);
    expect(ms[6]).toBeCloseTo(base / 0.84);
    expect(ms[7]).toBeCloseTo(base / 0.92);
    expect(ms[8]).toBeCloseTo(base);
    clock.advance(ms[11]!); // seven
    clock.advance(steps[steps.length - 1].durationMs!); // item-gap
    expect(steps[13].step.kind).toBe('item-gap');
    expect(steps[13].durationMs).toBe(400);
  });

  it('stops on a stop or chapter step and schedules nothing', () => {
    const { clock, player, texts } = setup(doc(section('s', undefined, prose('aa'), exhibit('code', { lines: 3 }), prose('bb'))));
    player.toggle();
    clock.advance(10000);
    expect(texts()).toEqual(['aa', 'stop']);
    expect(player.state).toBe('stopped');
    expect(clock.pending()).toBe(0);

    const c = setup(doc(section('s', { level: 1, text: 'C' }, prose('aa'))));
    c.player.toggle();
    expect(c.texts()).toEqual(['chapter']);
    expect(c.player.state).toBe('stopped');
    expect(c.clock.pending()).toBe(0);
  });

  it('continues from a stop with a fresh ramp', () => {
    const { clock, player, steps, texts } = setup(doc(section('s', undefined, prose('aa bb'), exhibit('table'), prose('cc dd'))));
    player.toggle();
    clock.advance(10000);
    expect(player.state).toBe('stopped');
    player.continue();
    expect(player.state).toBe('playing');
    expect(texts()).toEqual(['aa', 'bb', 'stop', 'cc']);
    expect(steps[3].durationMs).toBeCloseTo(base / 0.6);
  });

  it('continues from a chapter card, and toggle on a stop continues', () => {
    const { player, texts } = setup(doc(section('s', { level: 2, text: 'C' }, prose('aa bb'))));
    player.toggle();
    player.toggle();
    expect(texts()).toEqual(['chapter', 'aa']);
    expect(player.state).toBe('playing');
  });

  it('pauses and resumes with a fresh ramp', () => {
    const { clock, player, steps, texts, states } = setup(doc(section('s', undefined, prose(words(6)))));
    player.toggle();
    clock.advance(steps[0].durationMs!);
    clock.advance(steps[1].durationMs!);
    player.toggle();
    expect(player.state).toBe('paused');
    expect(clock.pending()).toBe(0);
    clock.advance(60000);
    expect(texts()).toEqual(['w0', 'w1', 'w2']);
    player.toggle();
    expect(states).toEqual(['playing', 'paused', 'playing']);
    expect(texts()).toEqual(['w0', 'w1', 'w2', 'w2']);
    expect(steps[3].durationMs).toBeCloseTo(base / 0.6);
  });

  it('ends with an end step carrying words read and elapsed time, and state idle', () => {
    const { clock, player, steps, states } = setup(doc(section('s', undefined, prose('aa bb'), flatList('x y', 'z'))));
    player.toggle();
    clock.advance(60000);
    const end = steps[steps.length - 1];
    expect(end.step.kind).toBe('end');
    if (end.step.kind !== 'end') return;
    expect(end.step.words).toBe(5);
    const expected = base / 0.6 + (base + 1.2 * base) / 0.68 + Math.max(1500, 3 * base * 1.5);
    expect(end.step.elapsedMs).toBeCloseTo(expected);
    expect(player.state).toBe('idle');
    expect(states[states.length - 1]).toBe('idle');
    expect(clock.pending()).toBe(0);
  });

  it('close cancels timers and emits state closed; later commands do nothing', () => {
    const { clock, player, states, steps } = setup(doc(section('s', undefined, prose(words(5)))));
    player.toggle();
    player.close();
    expect(clock.pending()).toBe(0);
    expect(states).toEqual(['playing', 'closed']);
    player.toggle();
    player.section(1);
    clock.advance(60000);
    expect(steps).toHaveLength(1);
    expect(player.state).toBe('closed');
  });
});

describe('player: navigation', () => {
  // s0: [aa bb. | cc dd.]  [stop]  s1: [ee ff.]
  const navDoc = () =>
    doc(
      section('s0', undefined, prose('aa bb. Cc dd.'), exhibit('code')),
      section('s1', { level: 3, text: 'One' }, prose('Ee ff.')),
      section('s2', { level: 1, text: 'Two' }, prose('Gg.')),
    );
  const current = (r: ReturnType<typeof setup>) => r.texts()[r.texts().length - 1];

  it('sentence(-1) inside a sentence goes to its first chunk, from a first chunk to the previous sentence', () => {
    const r = setup(navDoc());
    r.player.toggle();
    r.clock.advance(r.steps[0].durationMs!);
    r.clock.advance(r.steps[1].durationMs!);
    r.clock.advance(r.steps[2].durationMs!);
    expect(current(r)).toBe('dd.');
    r.player.sentence(-1);
    expect(current(r)).toBe('Cc');
    r.player.sentence(-1);
    expect(current(r)).toBe('aa');
    r.player.sentence(-1);
    expect(current(r)).toBe('aa');
    expect(r.player.state).toBe('playing');
    expect(r.steps[r.steps.length - 1].durationMs).toBeCloseTo(base / 0.6);
  });

  it('sentence moves cross blocks and sections and land on stops', () => {
    const r = setup(navDoc());
    r.player.toggle();
    r.player.sentence(1);
    expect(current(r)).toBe('Cc');
    r.player.sentence(1);
    expect(current(r)).toBe('stop');
    expect(r.player.state).toBe('stopped');
    r.player.sentence(1);
    expect(current(r)).toBe('title');
    r.player.sentence(1);
    expect(current(r)).toBe('Ee');
    r.player.sentence(-1);
    expect(current(r)).toBe('title');
    r.player.sentence(-1);
    expect(current(r)).toBe('stop');
  });

  it('section(+1/-1) and jumpToSection land on the section first step', () => {
    const r = setup(navDoc());
    r.player.toggle();
    r.player.section(1);
    expect(current(r)).toBe('title');
    expect(r.positions[r.positions.length - 1].sectionId).toBe('s1');
    r.player.section(1);
    expect(current(r)).toBe('chapter');
    expect(r.player.state).toBe('stopped');
    r.player.section(1);
    expect(r.positions[r.positions.length - 1].sectionId).toBe('s2');
    r.player.section(-1);
    expect(r.positions[r.positions.length - 1].sectionId).toBe('s1');
    r.player.jumpToSection('s0');
    expect(current(r)).toBe('aa');
    r.player.jumpToSection('s2');
    expect(current(r)).toBe('chapter');
    r.player.jumpToSection('missing');
    expect(current(r)).toBe('chapter');
  });

  it('jumpToBlock lands on the first step of the block with that source', () => {
    const d = navDoc();
    const r = setup(d);
    r.player.jumpToBlock(d.sections[1].blocks[0].source);
    expect(current(r)).toBe('Ee');
    expect(r.player.state).toBe('paused');
  });

  it('navigating while paused shows the target and stays paused', () => {
    const r = setup(navDoc());
    r.player.toggle();
    r.player.toggle();
    r.player.sentence(1);
    expect(current(r)).toBe('Cc');
    expect(r.player.state).toBe('paused');
    expect(r.clock.pending()).toBe(0);
  });

  it('emits position with section, block index and source on every position change', () => {
    const d = navDoc();
    const r = setup(d);
    r.player.toggle();
    r.clock.advance(60000);
    expect(r.positions.map((p) => [p.sectionId, p.blockIndex])).toEqual([
      ['s0', 0],
      ['s0', 0],
      ['s0', 0],
      ['s0', 0],
      ['s0', 1],
    ]);
    expect(r.positions[4].source).toBe(d.sections[0].blocks[1].source);
    expect(r.positions.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('player: speed, reading, exhibits', () => {
  it('speed(+25/-25) clamps to 100-1000, applies from the next step and emits settings', () => {
    const r = setup(doc(section('s', undefined, prose(words(10)))), { ...one, wpm: 990 });
    r.player.toggle();
    const firstMs = r.steps[0].durationMs!;
    r.player.speed(25);
    expect(r.saved.map((s) => s.wpm)).toEqual([1000]);
    expect(r.player.settings.wpm).toBe(1000);
    expect(r.clock.nextIn()).toBeCloseTo(firstMs);
    r.clock.advance(firstMs);
    expect(r.steps[1].durationMs).toBeCloseTo(60 / 0.68);
    r.player.speed(25);
    expect(r.player.settings.wpm).toBe(1000);
    for (let i = 0; i < 40; i++) r.player.speed(-25);
    expect(r.player.settings.wpm).toBe(100);
  });

  it('toggleReading enters and leaves reading, paused at the same position', () => {
    const r = setup(doc(section('s', undefined, prose(words(5)))));
    r.player.toggle();
    r.clock.advance(r.steps[0].durationMs!);
    r.player.toggleReading();
    expect(r.player.state).toBe('reading');
    expect(r.clock.pending()).toBe(0);
    r.player.toggleReading();
    expect(r.player.state).toBe('paused');
    expect(r.player.index).toBe(1);
    r.player.toggle();
    expect(r.texts()).toEqual(['w0', 'w1', 'w1']);
    expect(r.steps[2].durationMs).toBeCloseTo(base / 0.6);
  });

  it('expand pauses and emits the current exhibit', () => {
    const d = doc(section('s', undefined, exhibit('image')));
    const r = setup(d);
    const expanded: unknown[] = [];
    r.player.on('expand', (e) => expanded.push(e));
    r.player.toggle();
    r.player.expand();
    expect(r.player.state).toBe('paused');
    expect(expanded).toEqual([{ sectionId: 's', blockIndex: 0, source: d.sections[0].blocks[0].source }]);
  });

  it('revealedExhibits returns exhibits whose reveal step has been reached, all of them once the section is read', () => {
    const s: Settings = { ...one, table: { mode: 'skip', dwellSeconds: 5 } };
    const d = doc(
      section('a', undefined, prose('aa'), exhibit('code'), prose('bb'), exhibit('table')),
      section('b', { level: 4, text: 'B' }, prose('cc')),
    );
    const r = setup(d, s);
    const kinds = (id: string) => r.player.revealedExhibits(id).map((e) => e.block.kind);
    expect(kinds('a')).toEqual([]);
    r.player.toggle();
    expect(kinds('a')).toEqual([]);
    r.clock.advance(r.steps[0].durationMs!);
    expect(kinds('a')).toEqual(['code']);
    r.player.continue();
    expect(kinds('a')).toEqual(['code']);
    r.clock.advance(r.steps[r.steps.length - 1].durationMs!);
    expect(kinds('a')).toEqual(['code', 'table']);
    r.player.sentence(-1);
    r.player.sentence(-1);
    expect(r.texts()[r.texts().length - 1]).toBe('stop');
    expect(kinds('a')).toEqual(['code', 'table']);
    expect(kinds('b')).toEqual([]);
  });

  it('reveals the exhibits of a section the reader jumps past (position passed)', () => {
    const d = doc(
      section('a', undefined, prose('aa')),
      section('b', { level: 3, text: 'B' }, exhibit('image')),
      section('c', { level: 3, text: 'C' }, prose('cc')),
    );
    const r = setup(d);
    r.player.toggle();
    expect(r.player.revealedExhibits('b')).toEqual([]);
    r.player.jumpToSection('c');
    expect(r.player.revealedExhibits('b').map((e) => e.block.kind)).toEqual(['image']);
  });
});

describe('player: listeners and replay', () => {
  it('on returns an unsubscribe function', () => {
    const r = setup(doc(section('s', undefined, prose('aa bb'))));
    const seen: string[] = [];
    const off = r.player.on('state', (s) => seen.push(s));
    r.player.toggle();
    off();
    r.player.toggle();
    expect(seen).toEqual(['playing']);
  });

  it('toggle after the end plays again from the start, and commands work when destructured', () => {
    const r = setup(doc(section('s', undefined, prose('aa'), exhibit('code'))));
    const { toggle } = r.player;
    toggle();
    r.clock.advance(60000); // to the stop
    toggle(); // continue from the stop -> end
    expect(r.player.state).toBe('idle');
    toggle();
    expect(r.texts()).toEqual(['aa', 'stop', 'end', 'aa']);
    expect(r.player.state).toBe('playing');
  });
});

const skipAll: Settings = {
  ...one,
  code: { mode: 'skip', dwellSeconds: 5 },
  table: { mode: 'skip', dwellSeconds: 5 },
};
const last = (r: ReturnType<typeof setup>) => r.texts()[r.texts().length - 1];

describe('review p1-r1: commands after the end', () => {
  const endDoc = () =>
    doc(section('s0', undefined, prose('Aa bb. Cc dd.')), section('s1', { level: 4, text: 'T' }, prose('Ee.')), section('s2', undefined, exhibit('image')));

  function atEnd() {
    const r = setup(endDoc());
    r.player.toggle();
    r.clock.advance(600000);
    expect(r.player.state).toBe('idle');
    expect(r.player.index).toBe(r.timeline.steps.length);
    return r;
  }

  it('sentence(-1) from the end goes to the last landing, sentence(+1) does nothing', () => {
    const r = atEnd();
    const count = r.steps.length;
    r.player.sentence(1);
    expect(r.steps).toHaveLength(count);
    r.player.sentence(-1);
    expect(last(r)).toBe('dwell');
    expect(r.player.index).toBe(r.timeline.steps.length - 1);
  });

  it('section, expand, toggleReading and speed do not throw at the end', () => {
    const r = atEnd();
    expect(() => r.player.expand()).not.toThrow();
    expect(() => r.player.toggleReading()).not.toThrow();
    expect(() => r.player.toggleReading()).not.toThrow();
    expect(() => r.player.speed(25)).not.toThrow();
    r.player.section(-1);
    expect(r.positions[r.positions.length - 1].sectionId).toBe('s1');
  });
});

describe('review p1-r2: reading sessions', () => {
  it('starts the session on the first play after a jump', () => {
    const d = doc(section('a', undefined, prose('aa bb')), section('b', { level: 4, text: 'B' }, prose('cc dd')));
    const r = setup(d);
    r.clock.advance(5000);
    r.player.jumpToSection('b');
    r.clock.advance(1000);
    r.player.toggle();
    const startedAt = r.clock.now();
    r.clock.advance(600000);
    const end = r.steps[r.steps.length - 1].step;
    expect(end.kind).toBe('end');
    if (end.kind !== 'end') return;
    expect(end.words).toBe(2);
    expect(end.elapsedMs).toBeCloseTo(1200 + base / 0.6 + (base + 1.2 * base) / 0.68);
    expect(startedAt).toBe(6000);
  });

  it('replay after the end starts a new session', () => {
    const r = setup(doc(section('a', undefined, prose('aa bb'))));
    r.player.toggle();
    r.clock.advance(600000);
    r.clock.advance(10000);
    r.player.jumpToSection('a'); // replay through navigation, not toggle-from-idle
    r.player.toggle();
    r.clock.advance(600000);
    const ends = r.steps.filter((e) => e.step.kind === 'end').map((e) => e.step);
    expect(ends).toHaveLength(2);
    const second = ends[1];
    if (second.kind !== 'end') return;
    expect(second.words).toBe(2);
    expect(second.elapsedMs).toBeLessThan(5000);
  });
});

describe('review p1-r3: listeners that change the player', () => {
  it('a step listener that closes leaves no timer and the state closed', () => {
    const r = setup(doc(section('s', undefined, prose(words(5)))));
    r.player.on('step', () => r.player.close());
    r.player.toggle();
    expect(r.clock.pending()).toBe(0);
    r.clock.advance(600000);
    expect(r.player.state).toBe('closed');
    expect(r.steps).toHaveLength(1);
  });

  it('a state listener that closes on playing stops everything', () => {
    const r = setup(doc(section('s', undefined, prose(words(5)))));
    r.player.on('state', (s) => s === 'playing' && r.player.close());
    r.player.toggle();
    r.clock.advance(600000);
    expect(r.player.state).toBe('closed');
    expect(r.clock.pending()).toBe(0);
    expect(r.states).toEqual(['playing', 'closed']);
  });

  it('a step listener that pauses leaves no timer', () => {
    const r = setup(doc(section('s', undefined, prose(words(5)))));
    r.player.on('step', (e) => e.index === 1 && r.player.toggle());
    r.player.toggle();
    r.clock.advance(r.steps[0].durationMs!);
    expect(r.player.state).toBe('paused');
    expect(r.clock.pending()).toBe(0);
    r.clock.advance(600000);
    expect(r.texts()).toEqual(['w0', 'w1']);
  });
});

describe('review p1-r4: landing on a stop while not playing', () => {
  it('sets stopped with no timer, and one Space continues', () => {
    const d = doc(section('s', undefined, prose('Aa.'), exhibit('code'), prose('Bb.')), section('c', { level: 1, text: 'C' }, prose('Cc.')));
    const r = setup(d);
    r.player.sentence(1); // from idle: Aa -> stop
    expect(last(r)).toBe('stop');
    expect(r.player.state).toBe('stopped');
    expect(r.clock.pending()).toBe(0);
    r.player.toggle();
    expect(last(r)).toBe('Bb.');
    expect(r.player.state).toBe('playing');
    r.player.toggle(); // pause
    r.player.section(1);
    expect(last(r)).toBe('chapter');
    expect(r.player.state).toBe('stopped');
    r.player.toggle();
    expect(last(r)).toBe('Cc.');
  });
});

describe('review: navigation before the first play', () => {
  it('sentence and section from idle show the target paused', () => {
    const d = doc(section('s0', undefined, prose('Aa bb. Cc dd.')), section('s1', { level: 4, text: 'T' }, prose('Ee.')));
    const r = setup(d);
    r.player.sentence(1);
    expect(last(r)).toBe('Cc');
    expect(r.player.state).toBe('paused');
    r.player.section(1);
    expect(last(r)).toBe('title');
    expect(r.player.state).toBe('paused');
    expect(r.clock.pending()).toBe(0);
    r.player.toggle();
    expect(r.player.state).toBe('playing');
  });

  it('jumpToBlock with a heading position source lands on that heading', () => {
    const d = doc(section('a', { level: 4, text: 'A' }, prose('Aa.')), section('b', { level: 4, text: 'B' }, prose('Bb.')));
    const r = setup(d);
    r.player.section(1);
    const pos = r.positions[r.positions.length - 1];
    r.player.jumpToSection('a');
    r.player.jumpToBlock(pos.source);
    expect(r.player.index).toBe(pos.index);
    expect(r.positions[r.positions.length - 1].sectionId).toBe('b');
  });
});

describe('review p1-r6: replaceTimeline and setSpeed', () => {
  it('setSpeed sets and clamps wpm and emits settings', () => {
    const r = setup(doc(section('s', undefined, prose('aa'))));
    r.player.setSpeed(420);
    r.player.setSpeed(5000);
    r.player.setSpeed(1000);
    expect(r.saved.map((s) => s.wpm)).toEqual([420, 1000]);
  });

  it('changing chunkWords mid-document keeps the section and the sentence', () => {
    const d = doc(section('a', undefined, prose('Zz.')), section('b', { level: 4, text: 'B' }, prose('Aa bb cc dd. Ee ff gg hh.')));
    const r = setup(d);
    r.player.jumpToSection('b');
    r.player.sentence(1);
    r.player.sentence(1); // Ee
    r.player.toggle();
    r.clock.advance(r.steps[r.steps.length - 1].durationMs!); // ff
    expect(last(r)).toBe('ff');
    const two = { ...one, chunkWords: 2 };
    r.player.replaceTimeline(buildTimeline(d, two), two);
    expect(last(r)).toBe('Ee ff');
    expect(r.player.state).toBe('playing');
    expect(r.positions[r.positions.length - 1].sectionId).toBe('b');
    expect(r.player.settings.chunkWords).toBe(2);
    r.clock.advance(r.steps[r.steps.length - 1].durationMs!);
    expect(last(r)).toBe('gg hh.');
  });

  it('a stop changed to skip while stopped on it moves on to the next block and keeps it revealed', () => {
    const d = doc(section('a', undefined, prose('Aa.'), exhibit('code'), prose('Bb.')));
    const r = setup(d);
    r.player.toggle();
    r.clock.advance(r.steps[0].durationMs!);
    expect(r.player.state).toBe('stopped');
    r.player.replaceTimeline(buildTimeline(d, skipAll), skipAll);
    expect(last(r)).toBe('Bb.');
    expect(r.player.state).toBe('playing');
    expect(r.player.revealedExhibits('a').map((e) => e.block.kind)).toEqual(['code']);
    r.clock.advance(600000);
    const end = r.steps[r.steps.length - 1].step;
    expect(end.kind === 'end' && end.words).toBe(2);
  });

  it('keeps a paused state and an idle player idle', () => {
    const d = doc(section('a', undefined, prose('Aa bb.')));
    const r = setup(d);
    r.player.replaceTimeline(buildTimeline(d, one), one);
    expect(r.player.state).toBe('idle');
    r.player.toggle();
    r.player.toggle();
    r.player.replaceTimeline(buildTimeline(d, { ...one, chunkWords: 3 }), { ...one, chunkWords: 3 });
    expect(r.player.state).toBe('paused');
    expect(r.clock.pending()).toBe(0);
    expect(last(r)).toBe('Aa bb.');
  });
});

describe('review p1-r7: skipped exhibits are revealed by position passed', () => {
  it('reveals a step-less section of skipped exhibits when playback passes it', () => {
    const d = doc(
      section('a', undefined, prose('aa')),
      section('b', undefined, exhibit('table')),
      section('c', { level: 4, text: 'C' }, prose('cc')),
    );
    const r = setup(d, skipAll);
    r.player.toggle();
    expect(r.player.revealedExhibits('b')).toEqual([]);
    r.clock.advance(r.steps[0].durationMs!);
    expect(r.player.revealedExhibits('b').map((e) => e.block.kind)).toEqual(['table']);
  });

  it('reveals a trailing skipped exhibit when the reader leaves with section(+1)', () => {
    const d = doc(section('a', undefined, prose('aa'), exhibit('code')), section('b', { level: 4, text: 'B' }, prose('bb')));
    const r = setup(d, skipAll);
    r.player.toggle();
    expect(r.player.revealedExhibits('a')).toEqual([]);
    r.player.section(1);
    expect(r.player.revealedExhibits('a').map((e) => e.block.kind)).toEqual(['code']);
  });

  it('reveals a trailing skipped exhibit of the last section at the end', () => {
    const d = doc(section('a', undefined, prose('aa'), exhibit('code')));
    const r = setup(d, skipAll);
    r.player.toggle();
    r.clock.advance(600000);
    expect(r.player.revealedExhibits('a').map((e) => e.block.kind)).toEqual(['code']);
  });
});
