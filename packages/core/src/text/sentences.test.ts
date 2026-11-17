import { describe, expect, it } from 'vitest';
import type { Sentence, Token } from '../model';
import { splitSentences, tokenize } from './sentences';

const texts = (sentences: Sentence[]) => sentences.map((s) => s.tokens.map((t) => t.text).join(' '));
const split = (text: string) => texts(splitSentences(tokenize(text)));

describe('tokenize', () => {
  it('splits on whitespace into word tokens', () => {
    expect(tokenize('  one two\n three\tfour ')).toEqual([
      { kind: 'word', text: 'one' },
      { kind: 'word', text: 'two' },
      { kind: 'word', text: 'three' },
      { kind: 'word', text: 'four' },
    ]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('splitSentences', () => {
  it('returns Sentence[] from a token list', () => {
    const out = splitSentences(tokenize('One. Two.'));
    expect(out).toEqual([
      { tokens: [{ kind: 'word', text: 'One.' }] },
      { tokens: [{ kind: 'word', text: 'Two.' }] },
    ]);
    expect(splitSentences([])).toEqual([]);
  });

  it('splits on . ! ? and the ellipsis before an upper-case letter', () => {
    expect(split('It works. Then it stops! Why? Because… Nobody knows.')).toEqual([
      'It works.',
      'Then it stops!',
      'Why?',
      'Because…',
      'Nobody knows.',
    ]);
  });

  it('splits before a digit, a quote or a bracket', () => {
    expect(split('See below. 42 is the answer.')).toEqual(['See below.', '42 is the answer.']);
    expect(split('He left. "Bye," she said.')).toEqual(['He left.', '"Bye," she said.']);
    expect(split('Done. (Mostly.) Then more.')).toEqual(['Done.', '(Mostly.)', 'Then more.']);
  });

  it('does not split before a lower-case word', () => {
    expect(split('Version 2. it continues here.')).toEqual(['Version 2. it continues here.']);
  });

  it('splits after closing quotes or brackets that follow the mark', () => {
    expect(split('She said "stop!" Then left.')).toEqual(['She said "stop!"', 'Then left.']);
  });

  it.each(['e.g.', 'i.e.', 'etc.', 'vs.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'No.', 'Fig.'])(
    'does not split after the abbreviation %s',
    (abbr) => {
      expect(split(`See ${abbr} Smith for more.`)).toEqual([`See ${abbr} Smith for more.`]);
    },
  );

  it('does not split inside a number', () => {
    expect(split('Pi is 3.14 roughly. Next.')).toEqual(['Pi is 3.14 roughly.', 'Next.']);
  });

  it('does not split after a single capital letter', () => {
    expect(split('Ask J. Smith today. Done.')).toEqual(['Ask J. Smith today.', 'Done.']);
  });

  it('never splits at an atom token', () => {
    const tokens: Token[] = [
      { kind: 'word', text: 'Call' },
      { kind: 'atom', atom: 'code', text: 'x.run()' },
      { kind: 'atom', atom: 'math', text: 'a. B' },
      { kind: 'word', text: 'Then' },
      { kind: 'word', text: 'stop.' },
    ];
    const out = splitSentences(tokens);
    expect(out).toHaveLength(1);
    expect(out[0].tokens).toEqual(tokens);
  });
});
