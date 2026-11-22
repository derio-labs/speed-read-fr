import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';
import { doc, exhibit, flatList, item, list, prose, section } from './testing/doc';
import type { Block, Token } from './model';
import { buildTimeline, exhibitKey, exhibitKind, type BlockExhibit, type Step } from './timeline';

const settings = (over: Partial<Settings> = {}) => normalizeSettings({ ...DEFAULT_SETTINGS, readingMode: 'chunk', ...over });
const kinds = (d: ReturnType<typeof doc>, s = settings()) => buildTimeline(d, s).steps.map((st) => st.kind);

describe('buildTimeline: headings', () => {
  it('makes a chapter step for a heading at a stop level and a title step otherwise', () => {
    const d = doc(
      section('s1', { level: 1, text: 'Intro' }),
      section('s2', { level: 3, text: 'Detail' }),
      section('s3', { level: 2, text: 'Next' }),
    );
    const t = buildTimeline(d, settings());
    expect(t.steps.map((s) => s.kind)).toEqual(['chapter', 'title', 'chapter']);
    const title = t.steps[1];
    expect(title.kind === 'title' && title.text).toBe('Detail');
    expect(kinds(d, settings({ stopLevels: [3] }))).toEqual(['title', 'chapter', 'title']);
  });

  it('makes no step for an untitled section heading', () => {
    expect(kinds(doc(section('s0', undefined, prose('Hello there.'))))).toEqual(['chunk']);
  });

  it('fills the chapter card: title, words, summary and direct sub-heading titles', () => {
    const d = doc(
      section(
        'a',
        { level: 1, text: 'Guide' },
        prose('One two three.'),
        prose('Four.'),
        prose('Five.'),
        prose('Six.'),
        flatList('x', 'y'),
        exhibit('code', { lines: 2 }),
        exhibit('code', { lines: 3 }),
        exhibit('table', { rows: 2, cols: 2 }),
      ),
      section('b', { level: 3, text: 'Deep' }, prose('B.')),
      section('c', { level: 2, text: 'Setup' }, prose('C.')),
      section('d', { level: 3, text: 'Inner' }, prose('D.')),
      section('e', { level: 2, text: 'Usage' }, prose('E.')),
      section('f', { level: 1, text: 'Other' }),
    );
    const first = buildTimeline(d, settings()).steps[0];
    expect(first.kind).toBe('chapter');
    if (first.kind !== 'chapter') return;
    expect(first.card).toEqual({
      title: 'Guide',
      words: 8,
      summary: '4 paragraphs, 1 list, 2 code blocks, 1 table',
      subheadings: ['Deep', 'Setup', 'Usage'],
    });
  });

  it('summarises formulas, images and diagrams with singular forms', () => {
    const d = doc(
      section('a', { level: 1, text: 'T' }, prose('P.'), exhibit('math'), exhibit('image'), exhibit('diagram'), exhibit('diagram')),
    );
    const first = buildTimeline(d, settings()).steps[0];
    expect(first.kind === 'chapter' && first.card.summary).toBe('1 paragraph, 1 formula, 1 image, 2 diagrams');
  });
});

describe('buildTimeline: prose', () => {
  it('makes one chunk step per chunk with its sentence index', () => {
    const t = buildTimeline(doc(section('s', undefined, prose('One two three four. Five six.'))), settings());
    expect(
      t.steps.map((s) => (s.kind === 'chunk' ? [s.chunk.text, s.sentenceIndex, s.sentenceStart] : s.kind)),
    ).toEqual([
      ['One two three', 0, true],
      ['four.', 0, false],
      ['Five six.', 1, true],
    ]);
  });

  it('uses the chunk settings', () => {
    expect(kinds(doc(section('s', undefined, prose('a b c d'))), settings({ chunkWords: 1 }))).toEqual([
      'chunk',
      'chunk',
      'chunk',
      'chunk',
    ]);
  });
});

describe('buildTimeline: lists', () => {
  it('streams a list item by item with index, of and depth, and an item-gap after each item', () => {
    const block = flatList('one two three four five six seven', 'short item');
    const t = buildTimeline(doc(section('s', undefined, block)), settings());
    expect(
      t.steps.map((s) => (s.kind === 'item-chunk' ? [s.kind, s.chunk.text, s.index, s.of, s.depth] : [s.kind])),
    ).toEqual([
      ['item-chunk', 'one two three', 1, 2, 0],
      ['item-chunk', 'four five six', 1, 2, 0],
      ['item-chunk', 'seven', 1, 2, 0],
      ['item-gap'],
      ['item-chunk', 'short item', 2, 2, 0],
      ['item-gap'],
    ]);
  });

  it('shows a list whose items are all short as one list-whole step', () => {
    const block = flatList('apples', 'two pears', 'one two three four five six');
    const t = buildTimeline(doc(section('s', undefined, block)), settings());
    expect(t.steps.map((s) => s.kind)).toEqual(['list-whole']);
    const step = t.steps[0];
    expect(step.kind === 'list-whole' && step.words).toBe(9);
    expect(step.kind === 'list-whole' && step.block).toBe(block);
  });

  it('streams a short-item list with more than 8 items', () => {
    const block = flatList('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i');
    expect(kinds(doc(section('s', undefined, block)))[0]).toBe('item-chunk');
    expect(kinds(doc(section('s', undefined, flatList('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'))))).toEqual(['list-whole']);
  });

  it('streams a nested list with one long item, carrying depths', () => {
    const block = list([
      item('top', 1, 2, 0),
      item('nested one two three four five six seven', 1, 1, 1),
      item('back', 2, 2, 0),
    ]);
    const t = buildTimeline(doc(section('s', undefined, block)), settings());
    const chunks = t.steps.filter((s) => s.kind === 'item-chunk');
    expect(chunks.map((s) => (s.kind === 'item-chunk' ? [s.index, s.of, s.depth] : null))).toEqual([
      [1, 2, 0],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [2, 2, 0],
    ]);
    expect(t.steps.filter((s) => s.kind === 'item-gap')).toHaveLength(3);
  });

  it('gives item steps the item source', () => {
    const block = flatList('one two three four five six seven');
    const t = buildTimeline(doc(section('s', undefined, block)), settings());
    if (block.kind !== 'list') throw new Error('list');
    for (const s of t.steps) expect(s.source).toBe(block.items[0].source);
  });
});

describe('buildTimeline: exhibits', () => {
  it('stops on code, tables and math by default with a prompt naming the type and its size', () => {
    const d = doc(
      section(
        's',
        undefined,
        exhibit('code', { lines: 24 }),
        exhibit('code', { lines: 1 }),
        exhibit('table', { rows: 4, cols: 3 }),
        exhibit('table', { rows: 1, cols: 1 }),
        exhibit('math'),
      ),
    );
    const t = buildTimeline(d, settings());
    expect(t.steps.map((s) => (s.kind === 'stop' ? [s.exhibit, s.prompt] : s.kind))).toEqual([
      ['code', 'Code, 24 lines: Space to continue, E to expand'],
      ['code', 'Code, 1 line: Space to continue, E to expand'],
      ['table', 'Table, 4 rows by 3 columns: Space to continue, E to expand'],
      ['table', 'Table, 1 row by 1 column: Space to continue, E to expand'],
      ['math', 'Formula: Space to continue, E to expand'],
    ]);
  });

  it('names only the type when the size is unknown', () => {
    const t = buildTimeline(doc(section('s', undefined, exhibit('code'), exhibit('table'))), settings());
    expect(t.steps.map((s) => s.kind === 'stop' && s.prompt)).toEqual([
      'Code: Space to continue, E to expand',
      'Table: Space to continue, E to expand',
    ]);
  });

  it('dwells for the type seconds when set to dwell', () => {
    const s = settings({ code: { mode: 'dwell', dwellSeconds: 7 }, math: { mode: 'dwell', dwellSeconds: 4 } });
    const t = buildTimeline(doc(section('s', undefined, exhibit('code', { lines: 3 }), exhibit('math'))), s);
    expect(t.steps.map((st) => (st.kind === 'dwell' ? [st.exhibit, st.seconds] : st.kind))).toEqual([
      ['code', 7],
      ['math', 4],
    ]);
  });

  it('dwells on images and diagrams for imageDwellSeconds', () => {
    const s = settings({ imageDwellSeconds: 6 });
    const t = buildTimeline(doc(section('s', undefined, exhibit('image', { alt: 'cat' }), exhibit('diagram'))), s);
    expect(t.steps.map((st) => (st.kind === 'dwell' ? [st.exhibit, st.seconds] : st.kind))).toEqual([
      ['image', 6],
      ['diagram', 6],
    ]);
  });

  it('makes no step for a skipped type but lists it in the section exhibits with its reveal step', () => {
    const s = settings({ table: { mode: 'skip', dwellSeconds: 5 } });
    const table = exhibit('table', { rows: 2, cols: 2 });
    const code = exhibit('code', { lines: 2 });
    const d = doc(
      section('a', { level: 1, text: 'A' }, prose('Before.'), table, prose('After.'), code),
      section('b', { level: 1, text: 'B' }, prose('Next.'), exhibit('table')),
    );
    const t = buildTimeline(d, s);
    expect(t.steps.map((st) => st.kind)).toEqual(['chapter', 'chunk', 'chunk', 'stop', 'chapter', 'chunk']);
    expect(t.sections.map((sec) => sec.exhibits.map((e) => [exhibitKind(e), e.blockIndex, e.revealAt]))).toEqual([
      [
        ['table', 1, 2],
        ['code', 3, 3],
      ],
      [['table', 1, 6]],
    ]);
    expect((t.sections[0].exhibits[0] as BlockExhibit).block).toBe(table);
  });
});

describe('buildTimeline: positions', () => {
  it('ties every step to its section, block index and block source', () => {
    const p = prose('Hello world.');
    const c = exhibit('code', { lines: 1 });
    const d = doc(section('x', { level: 2, text: 'X' }, p, c));
    const t = buildTimeline(d, settings());
    expect(t.steps.map((s) => [s.sectionId, s.blockIndex, s.source])).toEqual([
      ['x', -1, d.sections[0].heading!.source],
      ['x', 0, p.source],
      ['x', 1, c.source],
    ]);
  });

  it('records each section first step, title and level', () => {
    const d = doc(section('a', undefined, prose('One.')), section('b', { level: 2, text: 'B' }, prose('Two.')), section('c', { level: 1, text: 'Empty' }));
    const t = buildTimeline(d, settings());
    expect(t.sections.map((s) => [s.id, s.firstStep, s.title, s.level])).toEqual([
      ['a', 0, undefined, undefined],
      ['b', 1, 'B', 2],
      ['c', 3, 'Empty', 1],
    ]);
  });
});

describe('buildTimeline: heading sources', () => {
  it('gives each heading step its own heading source', () => {
    const d = doc(section('a', { level: 1, text: 'A' }), section('b', { level: 4, text: 'B' }));
    const t = buildTimeline(d, settings());
    expect(t.steps[0].source).toBe(d.sections[0].heading!.source);
    expect(t.steps[1].source).toBe(d.sections[1].heading!.source);
    expect(t.steps[0].source).not.toBe(t.steps[1].source);
  });
});

describe('buildTimeline: flow mode', () => {
  const words = 'alpha beta gamma, delta epsilon zeta eta theta iota kappa.';
  const tokens = (d: ReturnType<typeof doc>, over: Partial<Settings>) => {
    const steps = buildTimeline(d, settings(over)).steps;
    return steps.flatMap((s) => (s.kind === 'chunk' ? [s.chunk.tokens.length] : []));
  };

  it('puts one token in every prose step whatever the chunk limits', () => {
    const d = doc(section('s', undefined, prose(words)));
    expect(tokens(d, { readingMode: 'flow', chunkWords: 5, chunkChars: 40 })).toEqual(Array(10).fill(1));
  });

  it('puts one token in every list item step', () => {
    const d = doc(section('s', undefined, flatList('first item has quite a few words in it', 'second item is long too, really')));
    const steps = buildTimeline(d, settings({ readingMode: 'flow', chunkWords: 5 })).steps;
    const item = steps.filter((s) => s.kind === 'item-chunk');
    expect(item.length).toBeGreaterThan(8);
    expect(item.every((s) => s.kind === 'item-chunk' && s.chunk.tokens.length === 1)).toBe(true);
  });

  it('leaves chunk mode on the stored limits', () => {
    const d = doc(section('s', undefined, prose(words)));
    expect(tokens(d, { readingMode: 'chunk', chunkWords: 3, chunkChars: 40 }).some((n) => n > 1)).toBe(true);
  });

  it('marks the sentence end on the last word only', () => {
    const d = doc(section('s', undefined, prose('One two three.')));
    const steps = buildTimeline(d, settings({ readingMode: 'flow' })).steps;
    expect(steps.map((s) => s.kind === 'chunk' && s.chunk.endsSentence)).toEqual([false, false, true]);
  });
});

describe('buildTimeline: long atoms in flow mode', () => {
  const atom = (text: string, kind: 'code' | 'math' = 'code'): Token => ({ kind: 'atom', atom: kind, text });
  const word = (text: string): Token => ({ kind: 'word', text });
  const proseOf = (...tokens: Token[]): Block => ({ kind: 'prose', sentences: [{ tokens }], source: { element: null } });
  const SHORT = 'a'.repeat(20);
  const LONG = 'b'.repeat(21);
  const flow = (over: Partial<Settings> = {}) => settings({ readingMode: 'flow', ...over });
  const chunkText = (s: Step) => (s.kind === 'chunk' || s.kind === 'item-chunk' ? s.chunk.text : s.kind);

  it('keeps a 20-character atom inline and turns a 21-character one into a chip with full text', () => {
    const d = doc(section('s', undefined, proseOf(word('see'), atom(SHORT), atom(LONG), word('end.'))));
    const steps = buildTimeline(d, flow()).steps;
    expect(steps.map(chunkText)).toEqual(['see', SHORT, '⟨code 1⟩', 'stop', 'end.']);
    const chip = steps[2];
    expect(chip.kind === 'chunk' && chip.chunk.tokens[0]).toEqual({ kind: 'atom', atom: 'code', text: '⟨code 1⟩', full: LONG, chip: 1 });
    const stop = steps[3];
    expect(stop).toMatchObject({ kind: 'stop', exhibit: 'code', inlineIndex: 1, chip: 1 });
    expect(stop.kind === 'stop' && stop.prompt).toContain('Space to continue');
  });

  it('numbers chips per kind from 1 in each section and lists each as its own exhibit', () => {
    const d = doc(
      section('s1', undefined, proseOf(atom(LONG), atom(LONG + 'x'), atom('m'.repeat(22), 'math')), proseOf(atom(LONG))),
      section('s2', undefined, proseOf(atom(LONG))),
    );
    const t = buildTimeline(d, flow());
    expect(t.steps.filter((s) => s.kind === 'chunk').map(chunkText)).toEqual(['⟨code 1⟩', '⟨code 2⟩', '⟨math 1⟩', '⟨code 3⟩', '⟨code 1⟩']);
    expect(t.sections[0].exhibits.map((e) => exhibitKey(e))).toEqual(['b0i1', 'b0i2', 'b0i3', 'b1i1']);
    const [first, , third] = t.sections[0].exhibits;
    expect(first).toMatchObject({ inline: true, kind: 'code', text: LONG, blockIndex: 0, inlineIndex: 1 });
    expect(third).toMatchObject({ inline: true, kind: 'math', text: 'm'.repeat(22) });
    expect(t.steps[first.revealAt].kind).toBe('stop');
  });

  it('carries the chip number on the exhibit, the stop prompt and the dwell step', () => {
    const d = doc(section('s', undefined, proseOf(atom(LONG), atom(LONG + 'x'))));
    const t = buildTimeline(d, flow());
    expect(t.sections[0].exhibits.map((e) => e.inline && e.chip)).toEqual([1, 2]);
    expect(t.steps.filter((s) => s.kind === 'stop').map((s) => s.kind === 'stop' && s.prompt.split(':')[0])).toEqual(['Code 1', 'Code 2']);
    const dwell = buildTimeline(d, flow({ code: { mode: 'dwell', dwellSeconds: 3 }, math: { mode: 'skip', dwellSeconds: 5 } }));
    expect(dwell.steps.filter((s) => s.kind === 'dwell').map((s) => s.kind === 'dwell' && s.chip)).toEqual([1, 2]);
  });

  it('gives a block exhibit the key b<blockIndex>', () => {
    const t = buildTimeline(doc(section('s', undefined, prose('Hi there.'), exhibit('code'))), flow());
    expect(exhibitKey(t.sections[0].exhibits[0])).toBe('b1');
  });

  it('follows the exhibit setting: dwell, math setting, skip adds no step but still lists the exhibit', () => {
    const d = doc(section('s', undefined, proseOf(atom(LONG), atom('m'.repeat(22), 'math'))));
    const dwell = buildTimeline(d, flow({ code: { mode: 'dwell', dwellSeconds: 7 }, math: { mode: 'skip', dwellSeconds: 5 } }));
    expect(dwell.steps.map((s) => s.kind)).toEqual(['chunk', 'dwell', 'chunk']);
    expect(dwell.steps[1]).toMatchObject({ kind: 'dwell', inlineIndex: 1, seconds: 7, exhibit: 'code' });
    expect(dwell.sections[0].exhibits).toHaveLength(2);
    const math = buildTimeline(d, flow({ code: { mode: 'skip', dwellSeconds: 5 } }));
    expect(math.steps.map((s) => s.kind)).toEqual(['chunk', 'chunk', 'stop']);
    expect(math.steps[2]).toMatchObject({ exhibit: 'math', inlineIndex: 2 });
    expect(math.steps[2].kind === 'stop' && math.steps[2].prompt).toMatch(/^Formula/);
  });

  it('puts the chip and its stop in list items too', () => {
    const it1 = item(`go`, 1, 1);
    it1.sentences = [{ tokens: [word('go'), atom(LONG)] }];
    const steps = buildTimeline(doc(section('s', undefined, list([it1, item('a b c d e f g h', 1, 1)]))), flow()).steps;
    expect(steps.map((s) => s.kind).slice(0, 4)).toEqual(['item-chunk', 'item-chunk', 'stop', 'item-gap']);
  });

  it('leaves chunk mode and short atoms alone', () => {
    const d = doc(section('s', undefined, proseOf(word('see'), atom(LONG), word('end.'))));
    const t = buildTimeline(d, settings({ readingMode: 'chunk', chunkChars: 80, chunkWords: 5 }));
    expect(t.steps.map((s) => s.kind)).toEqual(['chunk']);
    expect(t.sections[0].exhibits).toEqual([]);
  });
});
