import { describe, expect, it } from 'vitest';
import { blockStart, findHeadings, hoverable, isInFence, isParagraphStart, sectionRange, selectionRange } from './ranges';

const doc = (...lines: string[]) => lines.join('\n');

const SAMPLE = doc(
  '# Title', //            0
  '', //                   1
  'Intro paragraph', //    2
  'continues here.', //    3
  '', //                   4
  '## Part one', //        5
  '', //                   6
  '```sh', //              7
  '# not a heading', //    8
  'echo hi', //            9
  '```', //               10
  '', //                  11
  '- item one', //        12
  '  wraps on', //        13
  '- item two', //        14
  '', //                  15
  'Setext heading', //    16
  '--------------', //    17
  '', //                  18
  '### Deeper', //        19
  'text', //              20
  '', //                  21
  'Part two', //          22
  '========', //          23
  'last line', //         24
);

describe('findHeadings', () => {
  it('finds ATX and setext headings with line and level, ignoring # lines inside fenced code', () => {
    expect(findHeadings(SAMPLE)).toEqual([
      { line: 0, level: 1, text: 'Title' },
      { line: 5, level: 2, text: 'Part one' },
      { line: 16, level: 2, text: 'Setext heading' },
      { line: 19, level: 3, text: 'Deeper' },
      { line: 22, level: 1, text: 'Part two' },
    ]);
  });

  it('strips a closing # sequence and allows up to three spaces of indent', () => {
    expect(findHeadings(doc('   ## Closed ##', '    # indented code'))).toEqual([{ line: 0, level: 2, text: 'Closed' }]);
  });

  it('ignores tilde fences and longer fences closed only by a fence at least as long', () => {
    const text = doc('~~~~', '# in', '~~~', '# still in', '~~~~', '# out');
    expect(findHeadings(text)).toEqual([{ line: 5, level: 1, text: 'out' }]);
  });

  it('does not read a thematic break after a blank line as a setext underline', () => {
    expect(findHeadings(doc('para', '', '---', 'next'))).toEqual([]);
  });

  it('starts a multi-line setext heading on its first line', () => {
    expect(findHeadings(doc('', 'first', 'second', '===='))).toEqual([{ line: 1, level: 1, text: 'first second' }]);
  });

  it('a fence left open runs to the end of the file', () => {
    expect(findHeadings(doc('```', '# x'))).toEqual([]);
  });
});

describe('sectionRange', () => {
  const headings = findHeadings(SAMPLE);
  const count = SAMPLE.split('\n').length;

  it('ends on the line before the next heading of the same or a higher level', () => {
    expect(sectionRange(headings, 5, count)).toEqual({ startLine: 5, endLine: 15 });
    expect(sectionRange(headings, 16, count)).toEqual({ startLine: 16, endLine: 21 });
    expect(sectionRange(headings, 19, count)).toEqual({ startLine: 19, endLine: 21 });
    expect(sectionRange(headings, 0, count)).toEqual({ startLine: 0, endLine: 21 });
  });

  it('runs to the end when no such heading follows', () => {
    expect(sectionRange(headings, 22, count)).toEqual({ startLine: 22, endLine: 24 });
  });

  it('takes the heading the line belongs to when the line is not a heading', () => {
    expect(sectionRange(headings, 13, count)).toEqual({ startLine: 5, endLine: 15 });
  });

  it('reads from the line to the end when no heading precedes it', () => {
    expect(sectionRange([], 3, 10)).toEqual({ startLine: 3, endLine: 9 });
  });
});

describe('blockStart', () => {
  it('returns the first line of the paragraph containing the line', () => {
    expect(blockStart(SAMPLE, 3)).toBe(2);
    expect(blockStart(SAMPLE, 2)).toBe(2);
    expect(blockStart(SAMPLE, 24)).toBe(24);
  });

  it('returns the list item containing the line', () => {
    expect(blockStart(SAMPLE, 13)).toBe(12);
    expect(blockStart(SAMPLE, 14)).toBe(14);
  });

  it('returns the opening line of a fence', () => {
    expect(blockStart(SAMPLE, 9)).toBe(7);
    expect(blockStart(SAMPLE, 10)).toBe(7);
  });

  it('returns a heading line, and the first line for a setext underline', () => {
    expect(blockStart(SAMPLE, 5)).toBe(5);
    expect(blockStart(SAMPLE, 17)).toBe(16);
  });

  it('moves a blank line to the next block', () => {
    expect(blockStart(SAMPLE, 4)).toBe(5);
    expect(blockStart(SAMPLE, 11)).toBe(12);
    expect(blockStart(doc('a', ''), 1)).toBe(1);
  });

  it('does not walk back past a heading or a fence', () => {
    expect(blockStart(doc('# H', 'text right after'), 1)).toBe(1);
    expect(blockStart(doc('```', 'x', '```', 'after'), 3)).toBe(3);
  });
});

describe('selectionRange', () => {
  const sel = (sl: number, sc: number, el: number, ec: number) => ({ start: { line: sl, character: sc }, end: { line: el, character: ec } });

  it('widens to whole lines', () => {
    expect(selectionRange(sel(2, 4, 5, 3))).toEqual({ startLine: 2, endLine: 5 });
    expect(selectionRange(sel(2, 4, 2, 9))).toEqual({ startLine: 2, endLine: 2 });
  });

  it('does not take a line the selection only touches at column 0', () => {
    expect(selectionRange(sel(2, 0, 5, 0))).toEqual({ startLine: 2, endLine: 4 });
  });
});

describe('isParagraphStart, isInFence, hoverable', () => {
  it('isParagraphStart is true on the first line of a paragraph only', () => {
    expect(isParagraphStart(SAMPLE, 2)).toBe(true);
    expect(isParagraphStart(SAMPLE, 3)).toBe(false);
    expect(isParagraphStart(SAMPLE, 0)).toBe(false);
    expect(isParagraphStart(SAMPLE, 1)).toBe(false);
    expect(isParagraphStart(SAMPLE, 8)).toBe(false);
    expect(isParagraphStart(SAMPLE, 24)).toBe(true);
  });

  it('isInFence covers the fence lines including the markers', () => {
    expect([6, 7, 8, 9, 10, 11].map((l) => isInFence(SAMPLE, l))).toEqual([false, true, true, true, true, false]);
  });

  it('hoverable: headings and paragraph or list text, not fences, blanks, tables or breaks', () => {
    const text = doc('# H', 'para', '', '```', 'code', '```', '| a | b |', '***', '- item', '> quoted');
    expect(text.split('\n').map((_, l) => hoverable(text, l))).toEqual([true, true, false, false, false, false, false, false, true, true]);
  });
});
