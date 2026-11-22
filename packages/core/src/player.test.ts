import { describe, expect, it } from 'vitest';
import type { Doc } from './model';
import { rampFactor, stepDuration } from './pacing';
import { createPlayer, type PlayerEvents, type StepEvent } from './player';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { fakeClock } from './testing/clock';
import { doc, exhibit, flatList, item, list, prose, section } from './testing/doc';
import { fakeSpeech, voice } from './testing/speech';
import { createSpeechDriver } from './tts';
import { buildTimeline, exhibitKind } from './timeline';

const base = 200; // 300 wpm
const one: Settings = { ...DEFAULT_SETTINGS, readingMode: 'chunk', chunkWords: 1 };

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
    const kinds = (id: string) => r.player.revealedExhibits(id).map((e) => exhibitKind(e));
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
    expect(r.player.revealedExhibits('b').map((e) => exhibitKind(e))).toEqual(['image']);
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
    expect(r.player.revealedExhibits('a').map((e) => exhibitKind(e))).toEqual(['code']);
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

describe('setFlowMotion', () => {
  it('emits settings exactly once when the motion changes, keeping the position and the state', () => {
    const r = setup(doc(section('s', undefined, prose('Aa bb cc.'))), { ...one, flowMotion: 'word' });
    r.player.toggle();
    r.clock.advance(r.steps[0].durationMs!);
    const steps = r.steps.length;
    r.player.setFlowMotion('flowing');
    expect(r.saved.map((s) => s.flowMotion)).toEqual(['flowing']);
    expect(r.player.settings.flowMotion).toBe('flowing');
    expect(r.player.index).toBe(1);
    expect(r.player.state).toBe('playing');
    expect(r.steps).toHaveLength(steps);
  });

  it('emits nothing for the motion already set', () => {
    const r = setup(doc(section('s', undefined, prose('Aa bb.'))), { ...one, flowMotion: 'flowing' });
    r.player.setFlowMotion('flowing');
    expect(r.saved).toHaveLength(0);
  });

  it('does nothing after close', () => {
    const r = setup(doc(section('s', undefined, prose('Aa bb.'))), { ...one, flowMotion: 'word' });
    r.player.close();
    r.player.setFlowMotion('flowing');
    expect(r.saved).toHaveLength(0);
    expect(r.player.settings.flowMotion).toBe('word');
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
    expect(r.player.revealedExhibits('b').map((e) => exhibitKind(e))).toEqual(['table']);
  });

  it('reveals a trailing skipped exhibit when the reader leaves with section(+1)', () => {
    const d = doc(section('a', undefined, prose('aa'), exhibit('code')), section('b', { level: 4, text: 'B' }, prose('bb')));
    const r = setup(d, skipAll);
    r.player.toggle();
    expect(r.player.revealedExhibits('a')).toEqual([]);
    r.player.section(1);
    expect(r.player.revealedExhibits('a').map((e) => exhibitKind(e))).toEqual(['code']);
  });

  it('reveals a trailing skipped exhibit of the last section at the end', () => {
    const d = doc(section('a', undefined, prose('aa'), exhibit('code')));
    const r = setup(d, skipAll);
    r.player.toggle();
    r.clock.advance(600000);
    expect(r.player.revealedExhibits('a').map((e) => exhibitKind(e))).toEqual(['code']);
  });
});

describe('player: scrub (the position dial, spec section 13)', () => {
  const d = () =>
    doc(
      section('a', { level: 1, text: 'A' }, prose('aa bb cc'), exhibit('code'), prose('dd ee')),
      section('b', { level: 2, text: 'B' }, prose('ff gg hh ii')),
    );
  const kinds = (r: ReturnType<typeof setup>) => r.timeline.steps.map((s) => s.kind);

  it('moves by whole steps across stops and chapter cards without holding, both ways', () => {
    const r = setup(d());
    const steps = r.timeline.steps;
    expect(kinds(r)[0]).toBe('chapter');
    expect(r.player.scrub(2)).toBe(2);
    expect(r.player.index).toBe(2);
    const stop = kinds(r).indexOf('stop');
    const chapterB = kinds(r).lastIndexOf('chapter');
    // Over the stop and the second chapter card in one movement.
    expect(r.player.scrub(chapterB + 1 - 2)).toBe(chapterB + 1 - 2);
    expect(r.player.index).toBe(chapterB + 1);
    expect(stop).toBeLessThan(chapterB);
    // Landing on a stop shows it; the next movement goes straight on.
    r.player.scrub(stop - r.player.index);
    expect(r.player.index).toBe(stop);
    expect(r.steps.at(-1)!.step.kind).toBe('stop');
    r.player.scrub(1);
    expect(r.player.index).toBe(stop + 1);
    r.player.scrub(-(stop + 1));
    expect(r.player.index).toBe(0);
    expect(steps[0].kind).toBe('chapter');
  });

  it('returns the steps actually moved: fewer at either end, 0 past them', () => {
    const r = setup(d());
    const last = r.timeline.steps.length - 1;
    expect(r.player.scrub(-3)).toBe(0);
    expect(r.player.scrub(last + 10)).toBe(last);
    expect(r.player.index).toBe(last);
    expect(r.player.scrub(1)).toBe(0);
    expect(r.player.scrub(-2)).toBe(-2);
  });

  it('pauses playback and resumes 700 ms after the last movement with a fresh ramp', () => {
    const r = setup(d());
    r.player.toggle(); // chapter card: stopped
    r.player.continue();
    expect(r.player.state).toBe('playing');
    r.player.scrub(1);
    expect(r.player.state).toBe('paused');
    r.clock.advance(400);
    r.player.scrub(1);
    r.clock.advance(699);
    expect(r.player.state).toBe('paused');
    const at = r.player.index;
    const before = r.steps.length;
    r.clock.advance(1);
    expect(r.player.state).toBe('playing');
    expect(r.player.index).toBe(at);
    const resumed = r.steps[before];
    expect(resumed.index).toBe(at);
    expect(resumed.durationMs).toBeCloseTo(stepDuration(r.timeline.steps[at], one)! / rampFactor(0));
  });

  it('does not resume when it was not playing, or when the position is not on a timed step', () => {
    const r = setup(d());
    r.player.scrub(2);
    r.clock.advance(2000);
    expect(r.player.state).toBe('paused');

    const p = setup(d());
    p.player.toggle();
    p.player.continue();
    const stop = kinds(p).indexOf('stop');
    p.player.scrub(stop - p.player.index);
    p.clock.advance(2000);
    expect(p.player.state).toBe('stopped');
    expect(p.player.index).toBe(stop);
  });

  it('a command during the wait cancels the resume; close and reading ignore scrubs', () => {
    const r = setup(d());
    r.player.toggle();
    r.player.continue();
    r.player.scrub(1);
    r.player.toggle(); // play at once
    const playingAt = r.steps.length;
    r.player.toggle(); // pause again
    r.clock.advance(2000);
    expect(r.player.state).toBe('paused');
    expect(r.steps.length).toBe(playingAt);
    r.player.toggleReading();
    expect(r.player.scrub(1)).toBe(0);
    r.player.toggleReading();
    r.player.close();
    expect(r.player.scrub(1)).toBe(0);
    expect(r.clock.pending()).toBe(0);
  });
});

describe('player: text-to-speech (spec section 9)', () => {
  const spoken: Settings = { ...one, tts: { enabled: true, voiceURI: null } };

  function speaking(d: Doc, settings: Settings = spoken) {
    const clock = fakeClock();
    const speech = fakeSpeech([voice('Local', 'en-US', true)]);
    const driver = createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock });
    const timeline = buildTimeline(d, settings);
    const player = createPlayer(timeline, settings, clock, driver);
    const shown: string[] = [];
    const wholes: PlayerEvents['whole'][] = [];
    player.on('step', (e) => shown.push(e.step.kind === 'chunk' || e.step.kind === 'item-chunk' ? e.step.chunk.text : e.step.kind));
    player.on('whole', (w) => wholes.push(w));
    const texts = () => speech.spoken.map((u) => u.text);
    const last = () => speech.spoken[speech.spoken.length - 1];
    return { clock, speech, player, shown, wholes, texts, last, timeline };
  }

  it('speaks one utterance per sentence; boundaries pick the chunk; end moves to the next sentence', () => {
    const r = speaking(doc(section('s', undefined, prose('Aa bb cc. Dd ee.'))));
    r.player.toggle();
    expect(r.texts()).toEqual(['Aa bb cc.']);
    expect(r.shown).toEqual(['Aa']);
    // No pacing timer drives the chunks: only the driver's boundary wait is pending.
    r.last().boundary(3);
    expect(r.shown).toEqual(['Aa', 'bb']);
    r.last().boundary(6);
    expect(r.shown.at(-1)).toBe('cc.');
    r.last().end();
    expect(r.texts()).toEqual(['Aa bb cc.', 'Dd ee.']);
    expect(r.shown.at(-1)).toBe('Dd');
    expect(r.player.state).toBe('playing');
  });

  it('shows the whole sentence when the voice sends no boundaries', () => {
    const r = speaking(doc(section('s', undefined, prose('Aa bb cc.'))));
    r.player.toggle();
    r.clock.advance(1000);
    expect(r.wholes).toHaveLength(1);
    expect(r.wholes[0].from).toBe(0);
    expect(r.wholes[0].to).toBe(2);
  });

  it('speaks list items one by one, and titles', () => {
    const r = speaking(
      doc(section('s', { level: 4, text: 'A small title' }, list([item('the first item has several more words here', 1, 2), item('the second item has several more words too', 2, 2)]))),
    );
    r.player.toggle();
    expect(r.texts()).toEqual(['A small title']);
    r.last().end();
    expect(r.texts().at(-1)).toBe('the first item has several more words here');
    r.last().end();
    // The item gap is timed; then the next item is spoken.
    r.clock.advance(1000);
    expect(r.texts().at(-1)).toBe('the second item has several more words too');
  });

  it('never speaks code, tables or math; a stop cancels speech and continue speaks the next sentence', () => {
    const r = speaking(doc(section('s', undefined, prose('Aa.'), exhibit('code'), exhibit('table'), exhibit('math'), prose('Bb.'))));
    r.player.toggle();
    r.last().end();
    expect(r.player.state).toBe('stopped');
    r.player.continue();
    r.player.continue();
    r.player.continue();
    expect(r.texts()).toEqual(['Aa.', 'Bb.']);
  });

  it('pause, jumps and close cancel speech; a cancelled utterance ending does nothing', () => {
    const r = speaking(doc(section('a', undefined, prose('Aa bb. Cc dd.')), section('b', { level: 4, text: 'B' }, prose('Ee ff.'))));
    r.player.toggle();
    const first = r.last();
    const cancels = r.speech.synth.cancel.mock.calls.length;
    r.player.toggle(); // pause
    expect(r.speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
    first.end();
    expect(r.texts()).toHaveLength(1);
    expect(r.player.state).toBe('paused');
    r.player.toggle(); // play again from the same chunk
    expect(r.texts()).toEqual(['Aa bb.', 'Aa bb.']);
    r.player.sentence(1);
    expect(r.texts().at(-1)).toBe('Cc dd.');
    r.player.section(1);
    expect(r.texts().at(-1)).toBe('B');
    const before = r.speech.synth.cancel.mock.calls.length;
    r.player.close();
    expect(r.speech.synth.cancel.mock.calls.length).toBeGreaterThan(before);
    r.last().end();
    expect(r.texts().at(-1)).toBe('B');
  });

  it('speaks from the current chunk when playback resumes mid-sentence', () => {
    const r = speaking(doc(section('s', undefined, prose('Aa bb cc.'))));
    r.player.scrub(1);
    r.player.toggle();
    expect(r.texts()).toEqual(['bb cc.']);
  });

  it('with tts off, or without a usable voice, plays by the timer as before', () => {
    const off = speaking(doc(section('s', undefined, prose('Aa bb.'))), one);
    off.player.toggle();
    expect(off.texts()).toEqual([]);
    off.clock.advance(10_000);
    expect(off.shown).toContain('bb.');

    const clock = fakeClock();
    const speech = fakeSpeech([voice('Net', 'en-US', false)]);
    const driver = createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock });
    const p = createPlayer(buildTimeline(doc(section('s', undefined, prose('Aa bb.'))), spoken), spoken, clock, driver);
    p.toggle();
    expect(speech.spoken).toHaveLength(0);
  });
});

describe('review p5a-r10: scrubbing from a stop reached by playback', () => {
  it('resumes afterwards like any playing state', () => {
    const d = doc(section('s', undefined, prose('Aa bb.'), exhibit('code'), prose('Cc dd ee ff gg.')));
    const r = setup(d);
    r.player.toggle();
    for (let i = 0; i < 10 && r.player.state !== 'stopped'; i++) r.clock.advance(r.clock.nextIn() ?? 0);
    expect(r.player.state).toBe('stopped');
    r.player.scrub(1);
    r.clock.advance(700);
    expect(r.player.state).toBe('playing');
  });
});

describe('review p5b: speech errors and titles', () => {
  const spoken: Settings = { ...one, tts: { enabled: true, voiceURI: null } };
  function speaking(d: Doc) {
    const clock = fakeClock();
    const speech = fakeSpeech([voice('Local', 'en-US', true)]);
    const driver = createSpeechDriver(speech.synth, { Utterance: speech.Utterance, scheduler: clock });
    const player = createPlayer(buildTimeline(d, spoken), spoken, clock, driver);
    const steps: StepEvent[] = [];
    player.on('step', (e) => steps.push(e));
    const text = (e: StepEvent) => (e.step.kind === 'chunk' ? e.step.chunk.text : e.step.kind);
    return { clock, speech, driver, player, steps, text, texts: () => speech.spoken.map((u) => u.text) };
  }

  it('an error shows that sentence with timed chunks, never skips it; two in a row turn speech off (p5b-r3)', () => {
    const r = speaking(doc(section('s', undefined, prose('Aa bb. Cc dd. Ee ff.'))));
    r.player.toggle();
    r.speech.spoken[0].fail('network');
    const shown = r.steps.at(-1)!;
    expect(r.text(shown)).toBe('Aa');
    expect(shown.durationMs).not.toBeNull();
    r.clock.advance(shown.durationMs!);
    expect(r.text(r.steps.at(-1)!)).toBe('bb.');
    r.clock.advance(r.steps.at(-1)!.durationMs!);
    expect(r.texts().at(-1)).toBe('Cc dd.');
    r.speech.spoken.at(-1)!.fail('network');
    expect(r.driver.failed).toBe(true);
    r.clock.advance(5000);
    expect(r.texts()).toEqual(['Aa bb.', 'Cc dd.']);
    expect(r.steps.some((e) => r.text(e) === 'ff.')).toBe(true);
  });

  it('switches to timed text at the current chunk if speech fails mid-sentence', () => {
    const r = speaking(doc(section('s', undefined, prose('Aa bb cc.'))));
    r.player.toggle();
    r.speech.spoken[0].boundary(3);
    r.speech.spoken[0].fail('synthesis-failed');
    expect(r.text(r.steps.at(-1)!)).toBe('bb');
    expect(r.steps.at(-1)!.durationMs).not.toBeNull();
  });

  it('a title is spoken from its tokens, without inline math (p5b-r8)', () => {
    const s = section('s', { level: 4, text: 'Area x^2 here' }, prose('Aa.'));
    s.heading = { ...s.heading!, tokens: [{ kind: 'word', text: 'Area' }, { kind: 'atom', atom: 'math', text: 'x^2' }, { kind: 'word', text: 'here' }] };
    const r = speaking(doc(s));
    r.player.toggle();
    expect(r.texts()).toEqual(['Area here']);
  });
});
