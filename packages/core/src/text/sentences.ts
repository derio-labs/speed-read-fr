import type { Sentence, Token } from '../model';

const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'vs.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'No.', 'Fig.']);
const TRAILING_CLOSERS = /["'”’»)\]}]+$/u;
const LEADING_OPENERS = /^["'“‘«([{]+/u;
const ENDS_WITH_TERMINAL = /[.!?…]$/u;
const SINGLE_CAPITAL = /^\p{Lu}\.$/u;
const STARTS_SENTENCE = /^[\p{Lu}\p{Nd}"'“‘«([{]/u;

/** Word tokens from plain text, split on whitespace. */
export function tokenize(text: string): Token[] {
  return text
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .map((part) => ({ kind: 'word', text: part }));
}

/** Whether a sentence may end after `token`, judged by the token itself. */
function endsSentence(token: Token): boolean {
  if (token.kind !== 'word') return false;
  const core = token.text.replace(TRAILING_CLOSERS, '');
  if (!ENDS_WITH_TERMINAL.test(core)) return false;
  const bare = core.replace(LEADING_OPENERS, '');
  return !ABBREVIATIONS.has(bare) && !SINGLE_CAPITAL.test(bare);
}

/** Group tokens into sentences. A split falls only between two tokens, never inside an atom. */
export function splitSentences(tokens: Token[]): Sentence[] {
  const sentences: Sentence[] = [];
  let current: Token[] = [];
  tokens.forEach((token, i) => {
    current.push(token);
    const next = tokens[i + 1];
    if (next && endsSentence(token) && STARTS_SENTENCE.test(next.text)) {
      sentences.push({ tokens: current });
      current = [];
    }
  });
  if (current.length > 0) sentences.push({ tokens: current });
  return sentences;
}
