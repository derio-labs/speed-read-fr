import { describe, expect, it } from 'vitest';
import { orp, pivotIndex } from './orp';

describe('pivotIndex', () => {
  it.each([
    [1, 0],
    [2, 1],
    [5, 1],
    [6, 2],
    [9, 2],
    [10, 3],
    [13, 3],
    [14, 4],
    [30, 4],
  ])('length %i -> letter index %i', (n, idx) => {
    expect(pivotIndex(n)).toBe(idx);
  });
});

describe('orp', () => {
  it('splits a single word around its pivot letter', () => {
    expect(orp('a')).toEqual({ before: '', pivot: 'a', after: '' });
    expect(orp('read')).toEqual({ before: 'r', pivot: 'e', after: 'ad' });
    expect(orp('reading')).toEqual({ before: 're', pivot: 'a', after: 'ding' });
    expect(orp('comprehends')).toEqual({ before: 'com', pivot: 'p', after: 'rehends' });
    expect(orp('internationally')).toEqual({ before: 'inte', pivot: 'r', after: 'nationally' });
  });

  it('counts letters and digits only, skipping a leading quote or bracket', () => {
    // "(word," has 4 letters -> index 1 among letters -> 'o'
    expect(orp('(word,')).toEqual({ before: '(w', pivot: 'o', after: 'rd,' });
    expect(orp('"2026"')).toEqual({ before: '"2', pivot: '0', after: '26"' });
    // punctuation does not lengthen the word: "go!!!!!" is 2 letters -> index 1
    expect(orp('go!!!!!')).toEqual({ before: 'g', pivot: 'o', after: '!!!!!' });
  });

  it('anchors a multi-word chunk on the word holding the character midpoint', () => {
    // "the quick fox": length 13, midpoint 6 lies in "quick" (4-8); pivot of quick is 'u'
    expect(orp('the quick fox')).toEqual({ before: 'the q', pivot: 'u', after: 'ick fox' });
    // "ab cdefgh": length 9, midpoint 4 lies in "cdefgh" -> index 2 -> 'e'
    expect(orp('ab cdefgh')).toEqual({ before: 'ab cd', pivot: 'e', after: 'fgh' });
  });

  it('gives the word after a midpoint that falls on a space', () => {
    // "abc def": length 7, midpoint 3 is the space -> anchor "def" -> 'e'
    expect(orp('abc def')).toEqual({ before: 'abc d', pivot: 'e', after: 'f' });
  });

  it('keeps the whole text across before, pivot and after', () => {
    for (const text of ['one two three', 'x', '— dash', 'npm run build']) {
      const { before, pivot, after } = orp(text);
      expect(before + pivot + after).toBe(text);
    }
  });

  it('handles a word without letters and an empty text', () => {
    expect(orp('—')).toEqual({ before: '', pivot: '—', after: '' });
    expect(orp('')).toEqual({ before: '', pivot: '', after: '' });
  });
});
