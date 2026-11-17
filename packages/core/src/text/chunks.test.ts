import { describe, expect, it } from 'vitest';
import type { Sentence, Token } from '../model';
import { chunkSentence } from './chunks';
import { splitSentences, tokenize } from './sentences';

const sentence = (text: string): Sentence => ({ tokens: tokenize(text) });
const chunkTexts = (text: string, chunkWords = 3, chunkChars = 20) =>
  chunkSentence(sentence(text), { chunkWords, chunkChars }).map((c) => c.text);

describe('chunkSentence', () => {
  it('ends a chunk at the word limit', () => {
    expect(chunkTexts('a b c d e f g', 3, 80)).toEqual(['a b c', 'd e f', 'g']);
  });

  it('ends a chunk when the joined text would pass the character limit', () => {
    // "alpha beta" = 10 chars; adding " gamma" makes 16 > 12
    expect(chunkTexts('alpha beta gamma delta', 3, 12)).toEqual(['alpha beta', 'gamma delta']);
    // exactly at the limit is allowed
    expect(chunkTexts('abcd efgh ijk', 3, 14)).toEqual(['abcd efgh ijk']);
  });

  it('puts a token longer than chunkChars in its own chunk', () => {
    expect(chunkTexts('a internationalization b', 3, 10)).toEqual(['a', 'internationalization', 'b']);
  });

  it('never crosses a sentence', () => {
    const [first, second] = splitSentences(tokenize('One two. Three four.'));
    const opts = { chunkWords: 3, chunkChars: 20 };
    expect(chunkSentence(first, opts).map((c) => c.text)).toEqual(['One two.']);
    expect(chunkSentence(second, opts).map((c) => c.text)).toEqual(['Three four.']);
  });

  it('ends a chunk after a clause mark once it holds two or more tokens', () => {
    expect(chunkTexts('one two, three four', 3, 80)).toEqual(['one two,', 'three four']);
    expect(chunkTexts('a b; c d: e f — g h', 3, 80)).toEqual(['a b;', 'c d:', 'e f —', 'g h']);
    // a single token with a comma does not end the chunk
    expect(chunkTexts('Yes, we can go', 3, 80)).toEqual(['Yes, we can', 'go']);
  });

  it('gives single words for chunkWords 1', () => {
    expect(chunkTexts('one two three', 1, 80)).toEqual(['one', 'two', 'three']);
  });

  it('counts an atom as one word and by its text length', () => {
    const tokens: Token[] = [
      { kind: 'word', text: 'run' },
      { kind: 'atom', atom: 'code', text: 'npm run build' },
      { kind: 'word', text: 'now' },
      { kind: 'word', text: 'please' },
    ];
    const opts = { chunkWords: 3, chunkChars: 80 };
    const chunks = chunkSentence({ tokens }, opts);
    expect(chunks.map((c) => c.tokens.length)).toEqual([3, 1]);
    expect(chunks[0].tokens[1]).toEqual(tokens[1]);
    // "run npm run build" = 17 chars; adding " now" = 21 > 20
    expect(chunkSentence({ tokens }, { chunkWords: 3, chunkChars: 20 }).map((c) => c.text)).toEqual([
      'run npm run build',
      'now please',
    ]);
  });

  it('flags endsSentence on the last chunk and endsClause on clause marks', () => {
    const chunks = chunkSentence(sentence('one two, three four five.'), { chunkWords: 3, chunkChars: 80 });
    expect(chunks.map((c) => [c.text, c.endsSentence, c.endsClause])).toEqual([
      ['one two,', false, true],
      ['three four five.', true, false],
    ]);
  });

  it('returns no chunks for an empty sentence', () => {
    expect(chunkSentence({ tokens: [] }, { chunkWords: 3, chunkChars: 20 })).toEqual([]);
  });
});
