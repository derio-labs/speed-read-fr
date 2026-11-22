import { describe, expect, it } from 'vitest';
import { firstLetter, middleLetter } from './middle';

describe('middleLetter', () => {
  it('picks index floor((n-1)/2) among letters and digits', () => {
    expect(middleLetter('single')[0]).toBe(2);
    expect(middleLetter('word')[0]).toBe(1);
    expect(middleLetter('a')[0]).toBe(0);
    expect(middleLetter('ab')[0]).toBe(0);
    expect(middleLetter('abc')[0]).toBe(1);
  });

  it('skips punctuation when counting but returns the offset in the word', () => {
    const word = '(config),';
    expect(word[middleLetter(word)[0]]).toBe('n');
    expect(middleLetter('"2026"')[0]).toBe(2);
  });

  it('ends the span after the letter, whole for a surrogate pair', () => {
    expect(middleLetter('word')).toEqual([1, 2]);
    expect(middleLetter('')).toEqual([0, 0]);
    expect(middleLetter('---')).toEqual([1, 2]);
  });

  it('uses the middle character when the word has no letters or digits', () => {
    expect(middleLetter('---')[0]).toBe(1);
    expect(middleLetter('•')[0]).toBe(0);
    expect(middleLetter('')[0]).toBe(0);
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
