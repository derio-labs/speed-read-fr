import { describe, expect, it } from 'vitest';
import { middleLetter } from './middle';

describe('middleLetter', () => {
  it('picks index floor((n-1)/2) among letters and digits', () => {
    expect(middleLetter('single')).toBe(2);
    expect(middleLetter('word')).toBe(1);
    expect(middleLetter('a')).toBe(0);
    expect(middleLetter('ab')).toBe(0);
    expect(middleLetter('abc')).toBe(1);
  });

  it('skips punctuation when counting but returns the offset in the word', () => {
    const word = '(config),';
    expect(word[middleLetter(word)]).toBe('n');
    expect(middleLetter('"2026"')).toBe(2);
  });

  it('uses the middle character when the word has no letters or digits', () => {
    expect(middleLetter('---')).toBe(1);
    expect(middleLetter('•')).toBe(0);
    expect(middleLetter('')).toBe(0);
  });
});
