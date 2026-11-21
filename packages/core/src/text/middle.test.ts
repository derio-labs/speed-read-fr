import { describe, expect, it } from 'vitest';
import { middleLetter } from './middle';

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
